// Test the sync endpoint for rate change solicitor data
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load local.settings.json
const localSettingsPath = join(__dirname, '..', 'api', 'local.settings.json');
try {
    const localSettings = JSON.parse(readFileSync(localSettingsPath, 'utf8'));
    if (localSettings.Values) {
        Object.assign(process.env, localSettings.Values);
    }
} catch (e) {
    console.warn('Could not load local.settings.json:', e.message);
}

const fetch = global.fetch || require('node-fetch');
const { withRequest, sql } = require('../server/utils/db');
const { getSecret } = require('../server/utils/getSecret');

async function testSync() {
    // The matters with mismatches we found
    const testMatters = ['REEDA10978-00001', 'AH WI10970-00001'];
    
    // 1. Build SQL connection
    const sqlServer = process.env.SQL_SERVER_FQDN || 'helix-database-server.database.windows.net';
    const sqlDatabase = process.env.SQL_DATABASE_NAME || 'helix-core-data';
    const sqlUser = process.env.SQL_USER_NAME || 'helix-database-server';
    const passwordSecretName = process.env.SQL_PASSWORD_SECRET_NAME || 'sql-databaseserver-password';
    
    console.log('Fetching credentials...');
    const [sqlPassword, clioClientId, clioClientSecret, clioRefreshToken] = await Promise.all([
        getSecret(passwordSecretName),
        getSecret('lz-clio-v1-clientid'),
        getSecret('lz-clio-v1-clientsecret'),
        getSecret('lz-clio-v1-refreshtoken'),
    ]);
    
    const legacyConn = `Server=tcp:${sqlServer},1433;Initial Catalog=${sqlDatabase};Persist Security Info=False;User ID=${sqlUser};Password=${sqlPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
    
    // 2. Get Clio access token
    console.log('Getting Clio access token...');
    const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clioClientId}&client_secret=${clioClientSecret}&grant_type=refresh_token&refresh_token=${clioRefreshToken}`;
    const tokenResp = await fetch(tokenUrl, { method: 'POST' });
    const { access_token } = await tokenResp.json();
    
    const clioBase = 'https://eu.app.clio.com/api/v4';
    
    for (const displayNumber of testMatters) {
        console.log(`\n--- Processing ${displayNumber} ---`);
        
        // Get current SQL data
        const sqlBefore = await withRequest(legacyConn, async (request) => {
            request.input('displayNumber', sql.NVarChar, displayNumber);
            const result = await request.query(`
                SELECT 
                    [Responsible Solicitor] as responsible_solicitor,
                    [Originating Solicitor] as originating_solicitor
                FROM matters
                WHERE [Display Number] = @displayNumber
            `);
            return result.recordset[0] || null;
        });
        
        console.log('SQL before:', sqlBefore);
        
        // Get Clio data
        const searchUrl = `${clioBase}/matters?query=${encodeURIComponent(displayNumber)}&fields=id,display_number,responsible_attorney{name},originating_attorney{name}`;
        const resp = await fetch(searchUrl, { headers: { Authorization: `Bearer ${access_token}` } });
        const data = await resp.json();
        const clioMatter = data.data?.find(m => m.display_number === displayNumber);
        
        if (!clioMatter) {
            console.log('Matter not found in Clio!');
            continue;
        }
        
        const clioResp = clioMatter.responsible_attorney?.name || null;
        const clioOrig = clioMatter.originating_attorney?.name || null;
        console.log('Clio data:', { responsible: clioResp, originating: clioOrig });
        
        // Perform sync
        console.log('Syncing...');
        const updateResult = await withRequest(legacyConn, async (request) => {
            request.input('displayNumber', sql.NVarChar, displayNumber);
            request.input('responsible', sql.NVarChar, clioResp);
            request.input('originating', sql.NVarChar, clioOrig);
            
            const result = await request.query(`
                UPDATE matters
                SET [Responsible Solicitor] = @responsible,
                    [Originating Solicitor] = @originating
                WHERE [Display Number] = @displayNumber
            `);
            return result.rowsAffected[0] || 0;
        });
        
        console.log(`Updated ${updateResult} row(s)`);
        
        // Verify
        const sqlAfter = await withRequest(legacyConn, async (request) => {
            request.input('displayNumber', sql.NVarChar, displayNumber);
            const result = await request.query(`
                SELECT 
                    [Responsible Solicitor] as responsible_solicitor,
                    [Originating Solicitor] as originating_solicitor
                FROM matters
                WHERE [Display Number] = @displayNumber
            `);
            return result.recordset[0] || null;
        });
        
        console.log('SQL after:', sqlAfter);
        console.log('✓ Sync successful!');
    }
    
    process.exit(0);
}

testSync();
