const express = require('express');
const multer = require('multer');
const { DefaultAzureCredential } = require('@azure/identity');
const {
    BlobServiceClient,
    StorageSharedKeyCredential,
    BlobSASPermissions,
    generateBlobSASQueryParameters,
} = require('@azure/storage-blob');
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');

const router = express.Router();

// Multer: 20 MB limit, memory storage (streams to blob)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const blocked = /\.(exe|bat|cmd|sh|ps1|msi|dll|com|scr|vbs|js)$/i;
        if (blocked.test(file.originalname)) {
            return cb(new Error('File type not allowed'));
        }
        cb(null, true);
    },
});

const CONTAINER_NAME = 'instruction-files';

function getInstructionsConnectionString() {
    const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connectionString) {
        throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
    }
    return connectionString;
}

// Blob service client (reused)
let blobServiceClient = null;
const storageAccountName = 'instructionfiles';

function getBlobServiceClient() {
    if (blobServiceClient) return blobServiceClient;

    const connectionString = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;

    if (connectionString) {
        blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        return blobServiceClient;
    }
    if (accountKey) {
        const sharedKeyCredential = new StorageSharedKeyCredential(storageAccountName, accountKey);
        blobServiceClient = new BlobServiceClient(
            `https://${storageAccountName}.blob.core.windows.net`,
            sharedKeyCredential
        );
        return blobServiceClient;
    }
    // Fall back to DefaultAzureCredential (managed identity or dev login)
    const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
    blobServiceClient = new BlobServiceClient(
        `https://${storageAccountName}.blob.core.windows.net`,
        credential
    );
    return blobServiceClient;
}

async function generateBlobSasUrl(containerName, blobName, filename, minutes = 15) {
    try {
        const svc = getBlobServiceClient();

        // If service is using shared key, we can build SAS directly. Detect via credential type.
        // Access to underlying credential isn't public; try to create either shared-key SAS or user delegation SAS.
        const now = new Date();
        const startsOn = new Date(now.valueOf() - 5 * 60 * 1000); // 5 min clock skew
        const expiresOn = new Date(now.valueOf() + minutes * 60 * 1000);

        // Attempt user delegation SAS via AAD first; if it fails, try shared key if available
        try {
            // getUserDelegationKey works only with AAD credentials and requires appropriate RBAC
            const userDelegationKey = await svc.getUserDelegationKey(startsOn, expiresOn);
            const sas = generateBlobSASQueryParameters(
                {
                    containerName,
                    blobName,
                    permissions: BlobSASPermissions.parse('r'),
                    startsOn,
                    expiresOn,
                    contentDisposition: filename ? `inline; filename="${filename}"` : undefined,
                },
                userDelegationKey,
                storageAccountName
            ).toString();
            return `https://${storageAccountName}.blob.core.windows.net/${encodeURIComponent(containerName)}/${encodeURIComponent(blobName)}?${sas}`;
        } catch (e) {
            // Try shared key path when available
            const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
            if (!accountKey) throw e;
            const sharedKeyCredential = new StorageSharedKeyCredential(storageAccountName, accountKey);
            const sas = generateBlobSASQueryParameters(
                {
                    containerName,
                    blobName,
                    permissions: BlobSASPermissions.parse('r'),
                    startsOn,
                    expiresOn,
                    contentDisposition: filename ? `inline; filename="${filename}"` : undefined,
                },
                sharedKeyCredential
            ).toString();
            return `https://${storageAccountName}.blob.core.windows.net/${encodeURIComponent(containerName)}/${encodeURIComponent(blobName)}?${sas}`;
        }
    } catch (err) {
        // Best effort; return null to allow caller to fallback
        return null;
    }
}

/**
 * Get documents for a specific instruction
 */
router.get('/:instructionRef', async (req, res) => {
    try {
        const { instructionRef } = req.params;
        
        if (!instructionRef || instructionRef.trim() === '') {
            return res.status(400).json({ error: 'Invalid instruction reference' });
        }

        const connectionString = getInstructionsConnectionString();

        const documents = await withRequest(connectionString, async (request) => {
            const { recordset } = await request
                .input('instructionRef', sql.NVarChar, instructionRef)
                .query(`
                    SELECT DocumentId, InstructionRef, FileName, BlobUrl, FileSizeBytes,
                           UploadedBy, UploadedAt
                    FROM Documents
                    WHERE InstructionRef = @instructionRef
                    ORDER BY UploadedAt DESC
                `);
            return Array.isArray(recordset) ? recordset : [];
        });

        // If no documents found, return empty array with 200 status instead of error
        if (!documents || documents.length === 0) {
            return res.json([]);
        }

        // Precompute preview URLs; for Office docs we prefer a short-lived SAS URL so Office Online can fetch it
        const officeExts = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);
        const docsOut = [];
        for (const doc of documents) {
            const fileName = doc.FileName || '';
            const ext = (fileName.split('.').pop() || '').toLowerCase();

            let previewUrl = `/api/documents/preview/${instructionRef}/${doc.DocumentId}`; // default proxy

            if (officeExts.has(ext) && doc.BlobUrl) {
                try {
                    const urlObj = new URL(doc.BlobUrl);
                    const parts = urlObj.pathname.split('/');
                    const container = parts[1];
                    const blob = decodeURIComponent(parts.slice(2).join('/'));
                    const sasUrl = await generateBlobSasUrl(container, blob, fileName, 15);
                    if (sasUrl) {
                        // Use SAS URL as the preview base; client will wrap with Office viewer
                        previewUrl = sasUrl;
                    }
                } catch { /* fallback to proxy */ }
            }

            docsOut.push({
                ...doc,
                previewUrl, // used by client for iframe or Office viewer src
                directUrl: doc.BlobUrl,
                authWarning: 'Preview uses short-lived access; link expires soon.'
            });
        }

        res.json(docsOut);
        
    } catch (error) {
        console.error(`[Documents] Error fetching documents for ${req.params.instructionRef}:`, error);
        
        // Return 404 for common "not found" type errors instead of 500
        if (error.message && (
            error.message.includes('Invalid object name') ||
            error.message.includes('Cannot resolve') ||
            error.message.includes('does not exist')
        )) {
            console.log(`📭 Documents table/instruction not found for ${req.params.instructionRef}, returning 404`);
            return res.status(404).json({ error: 'Documents not found' });
        }
        
        // For connection errors, return 503 Service Unavailable
        if (error.code === 'ESOCKET' || error.code === 'ECONNRESET' || error.message?.includes('Connection')) {
            console.log(`🔌 Database connection error for ${req.params.instructionRef}, returning 503`);
            return res.status(503).json({ error: 'Database temporarily unavailable' });
        }
        
        // Default to 500 for unexpected errors
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

/**
 * Proxy document preview with Azure authentication
 */
router.get('/preview/:instructionRef/:documentId', async (req, res) => {
    let blobUrlForFallback;
    try {
        const { instructionRef, documentId } = req.params;
        const connectionString = getInstructionsConnectionString();
        const docId = Number(documentId);

        if (!Number.isFinite(docId)) {
            return res.status(400).json({ error: 'Invalid document id' });
        }

        const document = await withRequest(connectionString, async (request) => {
            const { recordset } = await request
                .input('instructionRef', sql.NVarChar, instructionRef)
                .input('documentId', sql.Int, docId)
                .query(`
                    SELECT BlobUrl, FileName
                    FROM Documents
                    WHERE InstructionRef = @instructionRef AND DocumentId = @documentId
                `);
            return recordset[0] || null;
        });

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const { BlobUrl, FileName } = document;
        blobUrlForFallback = BlobUrl;
        
        // Try different authentication approaches
        const blobServiceClient = getBlobServiceClient();
        
        // Parse blob URL to get container and blob name
        const url = new URL(BlobUrl);
        const pathParts = url.pathname.split('/');
        const containerName = pathParts[1];
        const blobName = pathParts.slice(2).join('/');
        
        // Get blob client
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(decodeURIComponent(blobName));
        
        // Check if blob exists
        const exists = await blobClient.exists();
        if (!exists) {
            return res.status(404).json({ error: 'File not found in storage' });
        }
        
        // Get blob properties for content type
        const properties = await blobClient.getProperties();
        
        // Set appropriate headers
        res.setHeader('Content-Type', properties.contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${FileName}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        // Stream the blob to response
        const downloadResponse = await blobClient.download();
        downloadResponse.readableStreamBody.pipe(res);
        
    } catch (error) {
        console.error('Error proxying document:', error);
        
        // Handle specific Azure errors
        if (blobUrlForFallback && error.code === 'AuthenticationFailed') {
            console.warn('Authentication failed for blob storage, falling back to direct URL');
            return res.redirect(blobUrlForFallback);
        }
        if (blobUrlForFallback && error.code === 'AuthorizationFailed') {
            console.warn('Authorization failed for blob storage, falling back to direct URL');  
            return res.redirect(blobUrlForFallback);
        }
        if (blobUrlForFallback && error.message && error.message.includes('PublicAccessNotPermitted')) {
            console.warn('Public access not permitted, falling back to direct URL');
            return res.redirect(blobUrlForFallback);
        }
        
        res.status(500).json({ error: 'Failed to retrieve document' });
    }
});

/**
 * Upload a document to blob storage + record in DB
 * POST /api/documents/:instructionRef
 * multipart/form-data with field "file"
 */
router.post('/:instructionRef', upload.single('file'), async (req, res) => {
    const start = Date.now();
    const { instructionRef } = req.params;
    const uploadedBy = req.user?.fullName || req.user?.email || 'Hub';
    try {
        if (!instructionRef || instructionRef.trim() === '') {
            return res.status(400).json({ error: 'Invalid instruction reference' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        trackEvent('Documents.Upload.Started', { instructionRef, fileName: req.file.originalname, uploadedBy, sizeBytes: String(req.file.size) });

        const svc = getBlobServiceClient();
        const containerClient = svc.getContainerClient(CONTAINER_NAME);
        // Blob path mirrors portal convention: {InstructionRef}/{seq}-{filename}
        const seq = Date.now();
        const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const blobName = `${instructionRef}/${seq}-${safeName}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(req.file.buffer, {
            blobHTTPHeaders: { blobContentType: req.file.mimetype || 'application/octet-stream' },
        });

        const blobUrl = blockBlobClient.url;

        // Insert DB record
        const connectionString = getInstructionsConnectionString();
        const newDoc = await withRequest(connectionString, async (request) => {
            const { recordset } = await request
                .input('instructionRef', sql.NVarChar, instructionRef)
                .input('fileName', sql.NVarChar, req.file.originalname)
                .input('blobUrl', sql.NVarChar, blobUrl)
                .input('fileSizeBytes', sql.BigInt, req.file.size)
                .input('uploadedBy', sql.NVarChar, uploadedBy)
                .query(`
                    INSERT INTO Documents (InstructionRef, FileName, BlobUrl, FileSizeBytes, UploadedBy, UploadedAt)
                    OUTPUT INSERTED.*
                    VALUES (@instructionRef, @fileName, @blobUrl, @fileSizeBytes, @uploadedBy, GETUTCDATE())
                `);
            return recordset[0];
        });

        const durationMs = Date.now() - start;
        trackEvent('Documents.Upload.Completed', { instructionRef, fileName: req.file.originalname, uploadedBy, durationMs: String(durationMs) });
        trackMetric('Documents.Upload.Duration', durationMs, { instructionRef });

        res.status(201).json(newDoc);
    } catch (error) {
        trackException(error, { operation: 'Documents.Upload', instructionRef, phase: 'upload' });
        trackEvent('Documents.Upload.Failed', { instructionRef, error: error.message, uploadedBy });
        console.error(`[Documents] Upload failed for ${instructionRef}:`, error);
        res.status(500).json({ error: 'Failed to upload document' });
    }
});

/**
 * Delete a document (blob + DB row)
 * DELETE /api/documents/:instructionRef/:documentId
 */
router.delete('/:instructionRef/:documentId', async (req, res) => {
    const { instructionRef, documentId } = req.params;
    const deletedBy = req.user?.fullName || req.user?.email || 'Hub';
    try {
        const docId = Number(documentId);
        if (!Number.isFinite(docId)) {
            return res.status(400).json({ error: 'Invalid document id' });
        }

        trackEvent('Documents.Delete.Started', { instructionRef, documentId: String(docId), deletedBy });

        const connectionString = getInstructionsConnectionString();

        // Fetch blob URL before deleting DB row
        const doc = await withRequest(connectionString, async (request) => {
            const { recordset } = await request
                .input('instructionRef', sql.NVarChar, instructionRef)
                .input('documentId', sql.Int, docId)
                .query(`SELECT BlobUrl FROM Documents WHERE InstructionRef = @instructionRef AND DocumentId = @documentId`);
            return recordset[0] || null;
        });

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete blob (best-effort — if it fails we still remove the DB row)
        try {
            const blobUrl = new URL(doc.BlobUrl);
            const parts = blobUrl.pathname.split('/');
            const container = parts[1];
            const blob = decodeURIComponent(parts.slice(2).join('/'));
            const svc = getBlobServiceClient();
            const blobClient = svc.getContainerClient(container).getBlobClient(blob);
            await blobClient.deleteIfExists();
        } catch (blobErr) {
            console.warn(`[Documents] Blob delete failed for doc ${docId}, proceeding with DB delete:`, blobErr.message);
        }

        // Delete DB row
        await withRequest(connectionString, async (request) => {
            await request
                .input('instructionRef', sql.NVarChar, instructionRef)
                .input('documentId', sql.Int, docId)
                .query(`DELETE FROM Documents WHERE InstructionRef = @instructionRef AND DocumentId = @documentId`);
        });

        trackEvent('Documents.Delete.Completed', { instructionRef, documentId: String(docId), deletedBy });
        res.json({ success: true });
    } catch (error) {
        trackException(error, { operation: 'Documents.Delete', instructionRef, documentId, phase: 'delete' });
        trackEvent('Documents.Delete.Failed', { instructionRef, documentId, error: error.message, deletedBy });
        console.error(`[Documents] Delete failed for ${instructionRef}/${documentId}:`, error);
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

module.exports = router;