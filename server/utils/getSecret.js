const { DefaultAzureCredential, AzureCliCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const isProduction = !!process.env.WEBSITE_INSTANCE_ID;
let credential = null;
let client = null;
const inflightSecrets = new Map();

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

    const existingRequest = inflightSecrets.get(name);
    if (existingRequest) {
        return existingRequest;
    }

    const request = getClient().getSecret(name)
        .then((secret) => secret.value)
        .finally(() => {
            inflightSecrets.delete(name);
        });

    inflightSecrets.set(name, request);
    return request;
}

module.exports = { getSecret, getCredential, getClient };
