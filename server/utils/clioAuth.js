/**
 * Clio OAuth — shared token management.
 *
 * Two modes:
 *   getClioAccessToken()          → service account (clio-teamhubv1-*) — read-only ops
 *   getClioAccessToken('lz')      → per-user credentials ({initials}-clio-v1-*) — write ops (audit trail)
 *
 * Token is cached in memory with a 2-minute buffer before expiry.
 *
 * Usage:
 *   const { getClioAccessToken, CLIO_API_BASE } = require('../utils/clioAuth');
 *   const token = await getClioAccessToken();          // service account
 *   const token = await getClioAccessToken('lz');       // per-user
 */

const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const KV_URI = 'https://helix-keys.vault.azure.net/';
const CLIO_TOKEN_URL = 'https://eu.app.clio.com/oauth/token';
const CLIO_API_BASE = 'https://eu.app.clio.com/api/v4';

const SERVICE_SECRET_NAMES = {
  refreshToken: 'clio-teamhubv1-refreshtoken',
  clientSecret: 'clio-teamhubv1-secret',
  clientId: 'clio-teamhubv1-clientid',
};

/** Build secret names for per-user credentials: {initials}-clio-v1-* */
function userSecretNames(initials) {
  const prefix = initials.toLowerCase();
  return {
    refreshToken: `${prefix}-clio-v1-refreshtoken`,
    clientSecret: `${prefix}-clio-v1-clientsecret`,
    clientId: `${prefix}-clio-v1-clientid`,
  };
}

// Per-key token cache: 'service' → service account, 'lz' → user, etc.
const tokenCaches = new Map();

/**
 * Get a Clio access token.
 * @param {string} [initials] — if provided, uses per-user credentials for audit trail.
 *                               Falls back to service account if user creds fail.
 */
async function getClioAccessToken(initials) {
  const cacheKey = initials ? initials.toLowerCase() : 'service';
  const now = Math.floor(Date.now() / 1000);

  const cached = tokenCaches.get(cacheKey);
  if (cached && cached.exp - 120 > now) {
    return cached.token;
  }

  const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
  const secretClient = new SecretClient(KV_URI, credential);

  const secretNames = initials ? userSecretNames(initials) : SERVICE_SECRET_NAMES;

  let refreshToken, clientSecretValue, clientId;
  try {
    const [refreshTokenSecret, clientSecret, clientIdSecret] = await Promise.all([
      secretClient.getSecret(secretNames.refreshToken),
      secretClient.getSecret(secretNames.clientSecret),
      secretClient.getSecret(secretNames.clientId),
    ]);
    refreshToken = refreshTokenSecret.value;
    clientSecretValue = clientSecret.value;
    clientId = clientIdSecret.value;
  } catch (kvError) {
    // If per-user creds not provisioned, fall back to service account
    if (initials) {
      console.warn(`[ClioAuth] Per-user creds not found for '${initials}', falling back to service account:`, kvError.message);
      return getClioAccessToken(); // recurse without initials → service account
    }
    throw kvError;
  }

  if (!refreshToken || !clientSecretValue || !clientId) {
    if (initials) {
      console.warn(`[ClioAuth] Per-user creds incomplete for '${initials}', falling back to service account`);
      return getClioAccessToken();
    }
    throw new Error('Clio OAuth credentials are missing.');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecretValue,
  });

  const tokenResponse = await fetch(`${CLIO_TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    if (initials) {
      console.warn(`[ClioAuth] Token refresh failed for '${initials}', falling back to service account:`, errorText);
      return getClioAccessToken();
    }
    throw new Error(`Failed to refresh Clio access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    if (initials) {
      console.warn(`[ClioAuth] No access token returned for '${initials}', falling back to service account`);
      return getClioAccessToken();
    }
    throw new Error('No access token returned from Clio.');
  }

  tokenCaches.set(cacheKey, { token: accessToken, exp: now + (tokenData.expires_in || 3600) });
  return accessToken;
}

module.exports = { getClioAccessToken, CLIO_API_BASE };
