const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const client = new SecretClient(vaultUrl, credential);

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
    const secret = await client.getSecret(name);
    return secret.value;
}

module.exports = { getSecret };
