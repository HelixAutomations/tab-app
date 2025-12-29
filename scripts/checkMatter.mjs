// Check specific matter data
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const localSettings = JSON.parse(readFileSync(join(__dirname, '..', 'api', 'local.settings.json'), 'utf8'));
Object.assign(process.env, localSettings.Values);

const { withRequest } = require('../server/utils/db');
const { getSecret } = require('../server/utils/getSecret');

async function main() {
    const displayNumber = process.argv[2] || 'ADKIN9551-00001';
    
    const [sqlPassword, clioClientId, clioClientSecret, clioRefreshToken] = await Promise.all([
        getSecret('sql-databaseserver-password'),
        getSecret('lz-clio-v1-clientid'),
        getSecret('lz-clio-v1-clientsecret'),
        getSecret('lz-clio-v1-refreshtoken'),
    ]);
    
    const conn = `Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=${sqlPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
    
    // Get SQL data
    const sqlResult = await withRequest(conn, async (req) => {
        const r = await req.query(`SELECT [Display Number], [Unique ID], [Responsible Solicitor], [Originating Solicitor], [Status] FROM matters WHERE [Display Number] = '${displayNumber}'`);
        return r.recordset[0];
    });
    
    console.log('SQL Data:', sqlResult);
    
    // Get Clio data using Unique ID
    if (sqlResult && sqlResult['Unique ID']) {
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clioClientId}&client_secret=${clioClientSecret}&grant_type=refresh_token&refresh_token=${clioRefreshToken}`;
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        const { access_token } = await tokenResp.json();
        
        const clioUrl = `https://eu.app.clio.com/api/v4/matters/${sqlResult['Unique ID']}?fields=id,display_number,responsible_attorney{name},originating_attorney{name}`;
        const clioResp = await fetch(clioUrl, { headers: { Authorization: `Bearer ${access_token}` } });
        const clioData = await clioResp.json();
        
        console.log('\nClio Data:', {
            display_number: clioData.data?.display_number,
            responsible: clioData.data?.responsible_attorney?.name,
            originating: clioData.data?.originating_attorney?.name,
        });
    }
    
    process.exit(0);
}

main();
