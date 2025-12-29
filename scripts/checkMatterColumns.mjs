// Check what columns exist in the matters table
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load local.settings.json
const localSettingsPath = join(__dirname, '..', 'api', 'local.settings.json');
const localSettings = JSON.parse(readFileSync(localSettingsPath, 'utf8'));
Object.assign(process.env, localSettings.Values);

const { withRequest } = require('../server/utils/db');
const { getSecret } = require('../server/utils/getSecret');

async function main() {
    const sqlPassword = await getSecret('sql-databaseserver-password');
    const conn = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=${sqlPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
    
    const samples = await withRequest(conn, async (req) => {
        const result = await req.query(`
            SELECT TOP 10 [Display Number], [Unique ID] 
            FROM matters 
            WHERE [Status] = 'Open' 
            ORDER BY [Open Date] DESC
        `);
        return result.recordset;
    });
    
    console.log('Sample Display Number vs Unique ID:');
    samples.forEach(s => console.log(`  ${s['Display Number']} => ${s['Unique ID']}`));
    process.exit(0);
}

main();
