/**
 * Shared Asana authentication utilities.
 * Resolves access tokens via env var or per-user OAuth refresh from the team table.
 */
const { withRequest } = require('./db');

const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID || '1203336123398249';
const ASANA_ACCOUNTS_PROJECT_ID = '1203336124217593';

async function getAsanaCredentials({ email, initials, entraId }) {
  const hasEmail = typeof email === 'string' && email.trim().length > 0;
  const hasInitials = typeof initials === 'string' && initials.trim().length > 0;
  const hasEntraId = typeof entraId === 'string' && entraId.trim().length > 0;
  if (!hasEmail && !hasInitials && !hasEntraId) return null;

  const connectionString = process.env.SQL_CONNECTION_STRING;
  if (!connectionString) throw new Error('SQL connection not configured.');

  return withRequest(connectionString, async (request, sqlClient) => {
    const filters = [];
    if (hasEmail) {
      request.input('email', sqlClient.VarChar(255), email.trim().toLowerCase());
      filters.push('LOWER([Email]) = @email');
    }
    if (hasInitials) {
      request.input('initials', sqlClient.VarChar(10), initials.trim().toUpperCase());
      filters.push('UPPER([Initials]) = @initials');
    }
    if (hasEntraId) {
      request.input('entraId', sqlClient.NVarChar(255), entraId.trim());
      filters.push('[Entra ID] = @entraId');
    }

    const query = `
      SELECT TOP 1 [ASANAClient_ID], [ASANASecret], [ASANARefreshToken]
      FROM [dbo].[team]
      WHERE ${filters.join(' OR ')}
    `;

    const result = await request.query(query);
    const row = result.recordset?.[0];
    if (!row?.ASANAClient_ID || !row?.ASANASecret || !row?.ASANARefreshToken) return null;
    return {
      clientId: row.ASANAClient_ID,
      secret: row.ASANASecret,
      refreshToken: row.ASANARefreshToken,
    };
  });
}

async function getAsanaAccessToken(credentials) {
  if (!credentials) return null;
  const tokenBody = new URLSearchParams();
  tokenBody.append('grant_type', 'refresh_token');
  tokenBody.append('client_id', credentials.clientId);
  tokenBody.append('client_secret', credentials.secret);
  tokenBody.append('refresh_token', credentials.refreshToken);

  const tokenResponse = await fetch('https://app.asana.com/-/oauth_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
    timeout: 10000,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to refresh Asana access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token || null;
}

async function resolveAsanaAccessToken({ email, initials, entraId }) {
  let accessToken = typeof process.env.ASANA_ACCESS_TOKEN === 'string'
    ? process.env.ASANA_ACCESS_TOKEN.trim()
    : '';

  if (!accessToken) {
    const creds = await getAsanaCredentials({ email, initials, entraId });
    if (!creds) return null;
    accessToken = await getAsanaAccessToken(creds);
  }

  return accessToken || null;
}

module.exports = {
  ASANA_BASE_URL,
  ASANA_WORKSPACE_ID,
  ASANA_ACCOUNTS_PROJECT_ID,
  getAsanaCredentials,
  getAsanaAccessToken,
  resolveAsanaAccessToken,
};
