const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const router = express.Router();

const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const client = new SecretClient(vaultUrl, credential);

function getLocalSecret(name) {
    const envKey = name.replace(/-/g, '_').toUpperCase();
    return process.env[envKey];
}

router.get('/:name', async (req, res) => {
    const name = req.params.name;
    try {
        if (process.env.USE_LOCAL_SECRETS === 'true') {
            const value = getLocalSecret(name);
            if (!value) {
                return res.status(404).json({ error: 'Secret not found' });
            }
            return res.json({ value });
        }

        const secret = await client.getSecret(name);
        res.json({ value: secret.value });
    } catch (err) {
        console.error('Failed to retrieve secret', err);
        res.status(500).json({ error: 'Failed to retrieve secret' });
    }
});

module.exports = router;
