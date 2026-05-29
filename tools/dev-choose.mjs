import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const choices = [
  { key: '1', profile: 'nodata', label: 'Fast shell', detail: 'No live data. Best first run and UI-only support.' },
  { key: '2', profile: 'enquiries', label: 'Enquiries / Pitch', detail: 'Enquiries and Pitch Builder, mine live.' },
  { key: '3', profile: 'matters', label: 'Matters / CCL', detail: 'Matters and CCL support, mine live.' },
  { key: '4', profile: 'reports', label: 'Reports', detail: 'Reports surface, mine live.' },
  { key: '5', profile: 'enqpipeline', label: 'Enquiries pipeline', detail: 'Enquiries with the local pipeline poller allowed.' },
  { key: '6', profile: 'system', label: 'System', detail: 'System Errors and live Hub telemetry, background pollers off.' },
];

console.log('\nHelix local support mode');
for (const choice of choices) {
  console.log(`  ${choice.key}) ${choice.label} - ${choice.detail}`);
}
console.log('  0) Cancel\n');

const rl = readline.createInterface({ input, output });
const answer = (await rl.question('Pick one: ')).trim();
rl.close();

if (answer === '0') {
  console.log('No dev stack started.');
  process.exit(0);
}

const selected = choices.find((choice) => choice.key === answer || choice.profile === answer.toLowerCase());
if (!selected) {
  console.error(`Unknown choice: ${answer || '(blank)'}`);
  process.exit(1);
}

const child = spawn(
  process.platform === 'win32' ? 'node.exe' : 'node',
  [path.join(__dirname, 'dev-profile.mjs'), selected.profile, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 0));