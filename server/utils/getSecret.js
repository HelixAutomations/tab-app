const fs = require('fs');
const path = require('path');
const { DefaultAzureCredential, AzureCliCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const isProduction = !!process.env.WEBSITE_INSTANCE_ID;
let credential = null;
let client = null;
const inflightSecrets = new Map();

// ── Dev-only local secret cache ──────────────────────────────────────────
// First successful Key Vault fetch is persisted to .secrets-cache.json
// (gitignored) so subsequent boots skip the ~5–200s Key Vault round-trip.
// Disabled automatically in production and when HELIX_NO_SECRET_CACHE=1.
const SECRET_CACHE_FILE = path.join(__dirname, '..', '..', '.secrets-cache.json');
const SECRET_CACHE_TTL_MS = Number(process.env.HELIX_SECRET_CACHE_TTL_MS) || (7 * 24 * 60 * 60 * 1000); // 7 days
const cacheEnabled = !isProduction && process.env.HELIX_NO_SECRET_CACHE !== '1';
let cacheMemo = null;

function readSecretCache() {
    if (!cacheEnabled) return {};
    if (cacheMemo) return cacheMemo;
    try {
        const raw = fs.readFileSync(SECRET_CACHE_FILE, 'utf8');
        cacheMemo = JSON.parse(raw);
    } catch {
        cacheMemo = {};
    }
    return cacheMemo;
}

function writeSecretCache(name, value) {
    if (!cacheEnabled) return;
    try {
        const cache = readSecretCache();
        cache[name] = { value, cachedAt: Date.now() };
        cacheMemo = cache;
        fs.writeFileSync(SECRET_CACHE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
    } catch (err) {
        // Non-fatal; we just lose the cache benefit this run.
        console.warn('[Secrets] Could not persist cache:', err?.message || err);
    }
}

function readCachedSecret(name) {
    if (!cacheEnabled) return undefined;
    const cache = readSecretCache();
    const entry = cache[name];
    if (!entry || typeof entry.value !== 'string') return undefined;
    if (Date.now() - (entry.cachedAt || 0) > SECRET_CACHE_TTL_MS) return undefined;
    return entry.value;
}

function getCredential() {
    if (!credential) {
        if (isProduction) {
            credential = new DefaultAzureCredential({
                additionallyAllowedTenants: ['*'],
                excludeWorkloadIdentityCredential: true,
                excludeAzurePowerShellCredential: true,
            });
        } else {
            // Dev: skip the credential chain (saves ~70s). Falls back to az login session.
            credential = new AzureCliCredential({ additionallyAllowedTenants: ['*'] });
        }
    }
    return credential;
}

function getClient() {
    if (!client) {
        client = new SecretClient(vaultUrl, getCredential());
    }
    return client;
}

function getLocalSecret(name) {
    const envKey = name.replace(/-/g, '_').toUpperCase();
    return process.env[envKey];
}

async function getSecret(name) {
    if (process.env.USE_LOCAL_SECRETS === 'true') {
        const value = getLocalSecret(name);
        if (!value) throw new Error('Secret not found');
        return value;
    }

    // Dev-only: return from on-disk cache if fresh. Saves 5–200s on boot.
    const cached = readCachedSecret(name);
    if (cached) return cached;

    const existingRequest = inflightSecrets.get(name);
    if (existingRequest) {
        return existingRequest;
    }

    const request = getClient().getSecret(name)
        .then((secret) => {
            const value = secret.value;
            if (typeof value === 'string' && value.length > 0) {
                writeSecretCache(name, value);
            }
            return value;
        })
        .finally(() => {
            inflightSecrets.delete(name);
        });

    inflightSecrets.set(name, request);
    return request;
}

module.exports = { getSecret, getCredential, getClient };
