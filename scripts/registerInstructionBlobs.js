#!/usr/bin/env node
/*
  Registers Azure Blob Storage files for a given InstructionRef into dbo.Documents.
  - Loads env from .env
  - Uses INSTRUCTIONS_STORAGE_CONNECTION_STRING or AZURE_STORAGE_CONNECTION_STRING
  - Uses INSTRUCTIONS_SQL_CONNECTION_STRING to write to SQL

  Usage:
    node scripts/registerInstructionBlobs.js HLX-26710-66409 [container=instructions] [uploadedBy=IL]
*/

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: false });
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: false });

const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const sql = require('mssql');

async function main() {
  const [instructionRefArg, containerArg, uploadedByArg] = process.argv.slice(2);
  if (!instructionRefArg) {
    console.error('InstructionRef is required. Example: node scripts/registerInstructionBlobs.js HLX-26710-66409');
    process.exit(1);
  }
  const instructionRef = instructionRefArg;
  const containerName = containerArg || 'instructions';
  const uploadedBy = uploadedByArg || 'IL';

  const storageConn = process.env.INSTRUCTIONS_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
  const accountKey = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_KEY || process.env.AZURE_STORAGE_ACCOUNT_KEY;
  const accountName = process.env.INSTRUCTIONS_STORAGE_ACCOUNT_NAME || 'instructionfiles';
  const sqlConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!sqlConn) {
    console.error('Missing INSTRUCTIONS_SQL_CONNECTION_STRING.');
    process.exit(1);
  }

  // Connect storage
  let blobService;
  if (storageConn) {
    blobService = BlobServiceClient.fromConnectionString(storageConn);
  } else if (accountKey) {
    const cred = new StorageSharedKeyCredential(accountName, accountKey);
    blobService = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, cred);
  } else {
    const cred = new DefaultAzureCredential();
    blobService = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, cred);
  }
  async function* enumerateBlobs(blobService, containerName, prefix) {
    // First, try the specified container
    try {
      const c = blobService.getContainerClient(containerName);
      for await (const item of c.listBlobsFlat({ prefix })) {
        yield { item, containerClient: c };
      }
      return;
    } catch (e) {
      // When the exact container doesn't exist, scan all containers
      console.warn(`Container '${containerName}' not found or not listable. Scanning all containers...`);
    }

    for await (const container of blobService.listContainers()) {
      const c = blobService.getContainerClient(container.name);
      try {
        for await (const item of c.listBlobsFlat({ prefix })) {
          yield { item, containerClient: c };
        }
      } catch {
        // ignore containers we can't list
      }
    }
  }

  // Parse SQL connection string into config
  const params = new URLSearchParams(sqlConn.split(';').join('&'));
  const serverHost = (params.get('Server') || '').replace('tcp:', '').split(',')[0];
  const database = params.get('Initial Catalog');
  const user = params.get('User ID');
  const password = params.get('Password');
  if (!serverHost || !database || !user || !password) {
    console.error('Invalid INSTRUCTIONS_SQL_CONNECTION_STRING: expected Server; Initial Catalog; User ID; Password');
    process.exit(1);
  }
  const sqlConfig = {
    server: serverHost,
    database,
    user,
    password,
    options: { encrypt: true, trustServerCertificate: false, enableArithAbort: true },
  };

  // Connect SQL
  const pool = new sql.ConnectionPool(sqlConfig);
  await pool.connect();

  const prefix = `${instructionRef}/`;
  let created = 0, skipped = 0, errors = 0;

  console.log(`Scanning for blobs with prefix '${prefix}' (container '${containerName}' or any)...`);
  for await (const { item, containerClient } of enumerateBlobs(blobService, containerName, prefix)) {
    if (!item.name || item.deleted) continue;
    const fileName = path.posix.basename(item.name);
  const blobClient = containerClient.getBlobClient(item.name);
    const blobUrl = blobClient.url; // full URL
    const size = item.properties?.contentLength ?? 0;

    try {
      // Insert if not exists (by InstructionRef + FileName or BlobUrl)
      const request = pool.request();
      request.input('InstructionRef', sql.NVarChar(100), instructionRef);
      request.input('FileName', sql.NVarChar(512), fileName);
      request.input('BlobUrl', sql.NVarChar(sql.MAX), blobUrl);
      request.input('FileSizeBytes', sql.BigInt, size);
      request.input('UploadedBy', sql.NVarChar(255), uploadedBy);

      const result = await request.query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.Documents 
          WHERE InstructionRef = @InstructionRef AND (FileName = @FileName OR BlobUrl = @BlobUrl)
        )
        BEGIN
          INSERT INTO dbo.Documents (InstructionRef, FileName, BlobUrl, FileSizeBytes, UploadedBy, UploadedAt)
          VALUES (@InstructionRef, @FileName, @BlobUrl, @FileSizeBytes, @UploadedBy, GETUTCDATE());
          SELECT 1 AS inserted;
        END
        ELSE
        BEGIN
          SELECT 0 AS inserted;
        END
      `);

      const inserted = result?.recordset?.[0]?.inserted === 1;
      if (inserted) {
        created++;
        console.log(`+ Registered: ${fileName}`);
      } else {
        skipped++;
        console.log(`~ Skipped (exists): ${fileName}`);
      }
    } catch (e) {
      errors++;
      console.error(`! Failed for ${fileName}:`, e.message || e);
    }
  }

  console.log(`Done. Inserted: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
  await pool.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
