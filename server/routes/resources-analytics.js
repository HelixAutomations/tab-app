const express = require('express');
const axios = require('axios');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const router = express.Router();

// ===== Graph helpers (Resources: Analytics & Dev) =====
const GRAPH_TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';
let graphSecretsCache = { clientId: null, clientSecret: null, expiresAt: 0 };
let graphTokenCache = { token: null, exp: 0 };

async function getGraphSecrets() {
  const now = Date.now();
  if (graphSecretsCache.clientId && graphSecretsCache.clientSecret && now < graphSecretsCache.expiresAt) {
    return { clientId: graphSecretsCache.clientId, clientSecret: graphSecretsCache.clientSecret };
  }

  try {
    const kvUri = 'https://helix-keys.vault.azure.net/';
    const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
    const secretClient = new SecretClient(kvUri, credential);

    const [clientIdSecret, clientSecretSecret] = await Promise.all([
      secretClient.getSecret('graph-aidenteams-clientid'),
      secretClient.getSecret('aiden-email-secret-value')
    ]);

    graphSecretsCache = {
      clientId: clientIdSecret.value || null,
      clientSecret: clientSecretSecret.value || null,
      expiresAt: Date.now() + 60 * 60 * 1000
    };

    return { clientId: graphSecretsCache.clientId, clientSecret: graphSecretsCache.clientSecret };
  } catch (error) {
    console.error('Error getting Graph secrets from Key Vault:', error);
    return { clientId: null, clientSecret: null };
  }
}

async function getGraphAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (graphTokenCache.token && graphTokenCache.exp - 300 > now) {
    return graphTokenCache.token;
  }

  const { clientId, clientSecret } = await getGraphSecrets();
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  try {
    const res = await axios.post(
      `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`,
      body.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const token = res.data?.access_token;
    if (!token) return null;
    graphTokenCache = { token, exp: now + (res.data?.expires_in || 3600) };
    return token;
  } catch (error) {
    console.error('Error obtaining Graph access token:', error?.response?.data || error.message);
    return null;
  }
}

// GET /api/resources/analytics/graph-user?q=<email|upn>
router.get('/graph-user', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ ok: false, error: 'Missing query.' });
  }

  try {
    const graphToken = await getGraphAccessToken();
    if (!graphToken) {
      return res.status(500).json({ ok: false, error: 'Unable to acquire Graph token.' });
    }

    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(query)}?$select=id,displayName,mail,userPrincipalName,jobTitle,department,accountEnabled`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${graphToken}` }
    });

    return res.json({ ok: true, user: response.data });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message = error?.response?.data || error?.message || 'Graph user lookup failed.';
    return res.status(status).json({ ok: false, error: message });
  }
});

module.exports = router;