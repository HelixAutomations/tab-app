import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const profiles = {
  nodata: {
    label: 'No data',
    supportMode: 'fast-shell',
    dataScope: 'none',
    disableLazyEventPoller: true,
  },
  enquiries: {
    label: 'Enquiries / Pitch',
    supportMode: 'enquiries',
    dataScope: 'mine',
    disableLazyEventPoller: true,
  },
  enqpipeline: {
    label: 'Enquiries / Pitch',
    supportMode: 'enquiries',
    dataScope: 'mine',
    disableLazyEventPoller: false,
  },
  matters: {
    label: 'Matters / CCL',
    supportMode: 'matters',
    dataScope: 'mine',
    disableLazyEventPoller: true,
  },
  reports: {
    label: 'Reports',
    supportMode: 'reports',
    dataScope: 'mine',
    disableLazyEventPoller: true,
  },
  tasks: {
    label: 'Tasks',
    supportMode: 'tasks',
    dataScope: 'mine',
    disableLazyEventPoller: true,
  },
  system: {
    label: 'System',
    supportMode: 'system',
    dataScope: 'mine',
    disableLazyEventPoller: true,
  },
};

const profileName = String(process.argv[2] || '').trim().toLowerCase();
const wantsHelp = profileName === '--help' || profileName === '-h';

if (!profileName || wantsHelp || !profiles[profileName]) {
  console.log('Usage: node tools/dev-profile.mjs <nodata|enquiries|enqpipeline|matters|reports|tasks|system> [dev-all args]');
  process.exit(!profileName || wantsHelp ? 0 : 1);
}

const profile = profiles[profileName];
const runnerArgs = process.argv.slice(3);

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || 'development',
  HELIX_DEV_PROFILE: profileName,
  HELIX_LAZY_INIT: '1',
  FORCE_BOOT_WARMUPS: 'false',
  BROWSER: 'none',
  REACT_APP_HELIX_SUPPORT_MODE: profile.supportMode,
  REACT_APP_HELIX_DATA_SCOPE: profile.dataScope,
  HELIX_DISABLE_LAZY_EVENT_POLLER: profile.disableLazyEventPoller ? '1' : process.env.HELIX_DISABLE_LAZY_EVENT_POLLER,
};

console.log(`[dev-profile] ${profile.label}: mode=${profile.supportMode} data=${profile.dataScope}`);

const child = spawn(
  process.platform === 'win32' ? 'node.exe' : 'node',
  [path.join(__dirname, 'dev-all-with-logs.mjs'), ...runnerArgs],
  { env, stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 0));