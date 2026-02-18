#!/usr/bin/env node
/**
 * Run CCL persistence migration against the Instructions DB.
 * Usage: node tools/db/run-ccl-migration.mjs [--dry-run]
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isDryRun = process.argv.includes('--dry-run');

const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
if (!connStr) {
    console.error('❌ INSTRUCTIONS_SQL_CONNECTION_STRING not set');
    process.exit(1);
}

const sqlFile = join(__dirname, 'migrate-ccl-persistence.sql');
const sqlText = readFileSync(sqlFile, 'utf-8');

// Split on GO statements (batch separator)
const batches = sqlText.split(/^\s*GO\s*$/gm).filter(b => b.trim());

if (isDryRun) {
    console.log('🔍 DRY RUN — would execute the following batches:\n');
    batches.forEach((b, i) => {
        console.log(`── Batch ${i + 1} ──`);
        console.log(b.trim().slice(0, 200) + (b.trim().length > 200 ? '...' : ''));
        console.log();
    });
    console.log(`Total: ${batches.length} batch(es)`);
    process.exit(0);
}

const m = await import('mssql');
const sql = m.default || m;

let pool;
try {
    console.log('🔌 Connecting to Instructions DB...');
    pool = await sql.connect(connStr);
    console.log('✅ Connected\n');

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i].trim();
        if (!batch) continue;
        console.log(`⚡ Executing batch ${i + 1}/${batches.length}...`);
        const result = await pool.request().query(batch);
        // Print any PRINT messages from the batch
        if (result?.output) console.log(result.output);
        console.log(`   ✅ Done`);
    }

    console.log('\n🎉 Migration complete');
} catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
} finally {
    if (pool) await pool.close();
}
