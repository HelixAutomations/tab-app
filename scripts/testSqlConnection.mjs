// Test SQL connection for rate change solicitor data
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load local.settings.json values into process.env
const localSettingsPath = join(__dirname, '..', 'api', 'local.settings.json');
try {
    const localSettings = JSON.parse(readFileSync(localSettingsPath, 'utf8'));
    if (localSettings.Values) {
        Object.assign(process.env, localSettings.Values);
    }
} catch (e) {
    console.warn('Could not load local.settings.json:', e.message);
}

const { withRequest, sql } = require('../server/utils/db');
const { getSecret } = require('../server/utils/getSecret');

async function testSQL() {
    // Build connection string with password from Key Vault
    const sqlServer = process.env.SQL_SERVER_FQDN || 'helix-database-server.database.windows.net';
    const sqlDatabase = process.env.SQL_DATABASE_NAME || 'helix-core-data';
    const sqlUser = process.env.SQL_USER_NAME || 'helix-database-server';
    const passwordSecretName = process.env.SQL_PASSWORD_SECRET_NAME || 'sql-databaseserver-password';
    
    console.log('Fetching SQL password from Key Vault...');
    const sqlPassword = await getSecret(passwordSecretName);
    
    const legacyConn = `Server=tcp:${sqlServer},1433;Initial Catalog=${sqlDatabase};Persist Security Info=False;User ID=${sqlUser};Password=${sqlPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
    console.log('Testing SQL connection...');
    console.log('Connection string exists:', !!legacyConn);
    
    if (!legacyConn) {
        console.error('No connection string found!');
        process.exit(1);
    }
    
    try {
        const result = await withRequest(legacyConn, async (request) => {
            return await request.query(`
                SELECT TOP 5
                    [Display Number] as display_number,
                    [Responsible Solicitor] as responsible_solicitor,
                    [Originating Solicitor] as originating_solicitor
                FROM matters
                WHERE [Status] = 'Open'
                ORDER BY [Open Date] DESC
            `);
        });
        
        console.log('\nSample matters from SQL:');
        result.recordset.forEach(m => {
            console.log(`  ${m.display_number}: Resp="${m.responsible_solicitor || 'NULL'}", Orig="${m.originating_solicitor || 'NULL'}"`);
        });
        console.log('\n✓ SQL connection successful!');
        
        // Now test with specific matters that we know
        const testMatters = ['DOVED10987-00001', 'P.A. 8588-00001', 'GILL10967-00001'];
        console.log('\nFetching specific matters for comparison:');
        
        const specificResult = await withRequest(legacyConn, async (request) => {
            return await request.query(`
                SELECT 
                    [Display Number] as display_number,
                    [Responsible Solicitor] as responsible_solicitor,
                    [Originating Solicitor] as originating_solicitor
                FROM matters
                WHERE [Display Number] IN ('DOVED10987-00001', 'P.A. 8588-00001', 'GILL10967-00001')
            `);
        });
        
        specificResult.recordset.forEach(m => {
            console.log(`  ${m.display_number}: Resp="${m.responsible_solicitor || 'NULL'}", Orig="${m.originating_solicitor || 'NULL'}"`);
        });
        
    } catch (err) {
        console.error('SQL Error:', err.message);
        process.exit(1);
    }
    
    process.exit(0);
}

testSQL();
