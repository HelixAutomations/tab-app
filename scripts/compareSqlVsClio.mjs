// Compare SQL vs Clio data for rate change solicitors
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

async function compareSqlVsClio() {
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
    
    // 3. Get recent open matters from SQL (TOP 200 to avoid rate limits)
    console.log('\nFetching 200 most recent open matters from SQL...');
    const sqlMatters = await withRequest(legacyConn, async (request) => {
        const result = await request.query(`
            SELECT TOP 200
                [Display Number] as display_number,
                [Unique ID] as clio_id,
                [Responsible Solicitor] as sql_responsible,
                [Originating Solicitor] as sql_originating
            FROM matters
            WHERE [Status] = 'Open'
            ORDER BY [Open Date] DESC
        `);
        return result.recordset || [];
    });
    
    console.log(`Found ${sqlMatters.length} matters to check\n`);
    
    // 4. Compare each against Clio - use ID lookup instead of display_number search
    // Add rate limiting to avoid 429 errors
    const mismatches = [];
    const matches = [];
    const notFound = [];
    
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let count = 0;
    
    for (const matter of sqlMatters) {
        count++;
        if (count % 50 === 0) {
            console.log(`Checked ${count}/${sqlMatters.length}...`);
        }
        
        if (!matter.clio_id) {
            notFound.push({ displayNumber: matter.display_number, reason: 'No Clio ID in SQL' });
            continue;
        }
        
        // Direct ID lookup - much more reliable than search
        const url = `https://eu.app.clio.com/api/v4/matters/${matter.clio_id}?fields=id,display_number,responsible_attorney{name},originating_attorney{name}`;
        let resp = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
        
        // Handle rate limiting with exponential backoff
        if (resp.status === 429) {
            console.log('  Rate limited, waiting 5s...');
            await delay(5000);
            resp = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
            if (resp.status === 429) {
                console.log('  Still rate limited, waiting 10s...');
                await delay(10000);
                resp = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
            }
        }
        
        if (!resp.ok) {
            notFound.push({ displayNumber: matter.display_number, reason: `Clio ${resp.status}` });
            continue;
        }
        
        const data = await resp.json();
        const clioMatter = data.data;
        
        // Longer delay between requests to avoid rate limiting
        await delay(100);
        
        if (!clioMatter) {
            notFound.push({ displayNumber: matter.display_number, reason: 'No data in response' });
            continue;
        }
        
        const clioResp = clioMatter.responsible_attorney?.name || null;
        const clioOrig = clioMatter.originating_attorney?.name || null;
        
        const respMatch = (matter.sql_responsible || '').toLowerCase().trim() === (clioResp || '').toLowerCase().trim();
        const origMatch = (matter.sql_originating || '').toLowerCase().trim() === (clioOrig || '').toLowerCase().trim();
        
        // Only count as mismatch if RESPONSIBLE doesn't match (that's what matters for rate changes)
        if (!respMatch) {
            mismatches.push({
                displayNumber: matter.display_number,
                sql: { responsible: matter.sql_responsible, originating: matter.sql_originating },
                clio: { responsible: clioResp, originating: clioOrig },
                respMatch,
                origMatch,
            });
        } else if (!origMatch) {
            // Originating only mismatch - track separately
            matches.push({ displayNumber: matter.display_number, note: 'originating differs' });
        } else {
            matches.push({ displayNumber: matter.display_number });
        }
    }
    
    // 5. Report
    const origOnlyDiffs = matches.filter(m => m.note === 'originating differs').length;
    console.log('='.repeat(60));
    console.log('COMPARISON RESULTS');
    console.log('='.repeat(60));
    console.log(`✓ Full matches: ${matches.length - origOnlyDiffs}`);
    console.log(`~ Originating only differs: ${origOnlyDiffs}`);
    console.log(`⚠ RESPONSIBLE MISMATCHES: ${mismatches.length}`);
    console.log(`? Not found in Clio: ${notFound.length}`);
    
    if (mismatches.length > 0) {
        console.log('\n--- MISMATCHES ---');
        mismatches.forEach(m => {
            console.log(`\n${m.displayNumber}:`);
            console.log(`  SQL:  Resp="${m.sql.responsible || 'NULL'}", Orig="${m.sql.originating || 'NULL'}"`);
            console.log(`  Clio: Resp="${m.clio.responsible || 'NULL'}", Orig="${m.clio.originating || 'NULL'}"`);
        });
    }
    
    // Suppress the "not found" list - too long
    if (notFound.length > 0) {
        console.log('\n--- NOT FOUND IN CLIO ---');
        notFound.forEach(n => console.log(`  ${n.displayNumber}: ${n.reason}`));
    }
    
    process.exit(0);
}

compareSqlVsClio();
