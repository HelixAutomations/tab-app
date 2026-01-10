import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const azuriteDir = path.join(repoRoot, 'azurite');

const maybeJsonFiles = [
  '__azurite_db_blob__.json',
  '__azurite_db_blob_extent__.json',
  '__azurite_db_queue__.json',
  '__azurite_db_queue_extent__.json',
  '__azurite_db_table__.json',
  '__azurite_db_table_extent__.json',
];

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeRm(targetPath) {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function cleanCorruptAzuriteStateIfNeeded() {
  let shouldReset = false;

  for (const filename of maybeJsonFiles) {
    const fullPath = path.join(azuriteDir, filename);
    if (!(await fileExists(fullPath))) continue;

    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      JSON.parse(raw);
    } catch {
      shouldReset = true;
      break;
    }
  }

  if (!shouldReset) return;

  // If the metadata DB JSON is corrupt, Azurite fails to boot. Reset just the local emulator state.
  for (const filename of maybeJsonFiles) {
    await safeRm(path.join(azuriteDir, filename));
  }
  await safeRm(path.join(azuriteDir, '__blobstorage__'));
  await safeRm(path.join(azuriteDir, '__queuestorage__'));
  await safeRm(path.join(azuriteDir, '__tablestorage__'));
}

await cleanCorruptAzuriteStateIfNeeded();

const args = [
  'azurite',
  '--location',
  './azurite',
  '--debug',
  './azurite/debug.log',
  '--blobPort',
  '10000',
  '--queuePort',
  '10001',
  '--tablePort',
  '10002',
];

const child = spawn('npx', args, { stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
