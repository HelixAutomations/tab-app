// Use the same v3 programming model as other functions
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');
const { getSqlPool } = require('../sqlClient');

const keyVaultName = process.env.KEY_VAULT_NAME;
if (!keyVaultName && !process.env.KEY_VAULT_URL) {
    throw new Error('Key Vault not specified! Set KEY_VAULT_NAME or KEY_VAULT_URL');
}
const vaultUrl = process.env.KEY_VAULT_URL || `https://${keyVaultName}.vault.azure.net/`;
const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(vaultUrl, credential);
let passwordPromise;

async function ensureDbPassword() {
    if (process.env.DB_PASSWORD) return process.env.DB_PASSWORD;
    if (!passwordPromise) {
        const secretName = process.env.DB_PASSWORD_SECRET || 'instructionsadmin-password';
        passwordPromise = secretClient.getSecret(secretName).then(s => {
            process.env.DB_PASSWORD = s.value;
            return s.value;
        });
    }
    return passwordPromise;
}

module.exports = async function (context, req) {
    context.log('fetchSnippetEdits function invoked');

    if (req.method !== 'POST') {
        context.res = { status: 405, body: 'Method not allowed' };
        return;
    }

    const body = req.body || {};
    if (body.action !== 'getSnippetEdits') {
        context.res = { status: 400, body: 'Invalid action' };
        return;
    }

    try {
        context.log('Ensuring database password');
        await ensureDbPassword();
        const pool = await getSqlPool();
        context.log('SQL pool acquired, executing query');
        // Default to the pitchbuilder schema so local development works
        // even if DB_SCHEMA is not provided via environment variables.
        const schema = process.env.DB_SCHEMA || 'pitchbuilder';

        const result = await pool.request().query(`
      SELECT
        e.EditId AS id,
        s.SnippetId AS snippetId,
        b.Title AS blockTitle,
        s.Content AS currentText,
        s.Label AS currentLabel,
        s.SortOrder AS currentSortOrder,
        s.BlockId AS currentBlockId,
        e.ProposedContent AS proposedText,
        e.ProposedLabel AS proposedLabel,
        e.ProposedSortOrder AS proposedSortOrder,
        e.ProposedBlockId AS proposedBlockId,
        e.IsNew AS isNew,
        e.ProposedBy AS submittedBy,
        e.ReviewNotes AS reviewNotes,
        e.Status AS status
      FROM ${schema}.DefaultSnippetEdits e
      JOIN ${schema}.DefaultBlockSnippets s ON e.SnippetId = s.SnippetId
      JOIN ${schema}.DefaultBlocks b ON s.BlockId = b.BlockId
      WHERE e.Status = 'pending'
      ORDER BY e.EditId
    `);

        const edits = result.recordset || [];
        context.log(`Query returned ${edits.length} edits`);
        context.res = {
            status: 200,
            body: JSON.stringify(edits),
            headers: { 'Content-Type': 'application/json' }
        };
    } catch (err) {
        context.log.error('fetchSnippetEdits error', err);
        context.res = { status: 500, body: 'Failed to fetch snippet edits' };
    }
};