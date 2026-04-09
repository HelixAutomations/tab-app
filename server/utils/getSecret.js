const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
let credential = null;
let client = null;
const inflightSecrets = new Map();

function getCredential() {
    if (!credential) {
        credential = new DefaultAzureCredential({
            additionallyAllowedTenants: ['*'],
            excludeManagedIdentityCredential: !process.env.WEBSITE_INSTANCE_ID,
            excludeWorkloadIdentityCredential: true,
            excludeAzurePowerShellCredential: true,
        });
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
