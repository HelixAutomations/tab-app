/**
 * Outstanding Client Balances Routes
 * Fetches outstanding client balance data from Clio API
 */

const express = require('express');
const router = express.Router();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { getRedisClient, generateCacheKey, cacheWrapper } = require('../utils/redisClient');
const { withRequest } = require('../utils/db');

// Cache for Clio access token (reuse across requests to avoid constant refreshes)
let cachedAccessToken = null;
let tokenExpiresAt = null;

/**
 * GET /api/outstanding-balances/user/:entraId
 * Returns outstanding client balances for a specific user's matters only
 * Much faster than fetching all balances
 */
router.get('/user/:entraId', async (req, res) => {
  try {
    const { entraId } = req.params;
    console.log(`[OutstandingBalances] Fetching user balances for Entra ID: ${entraId}`);

    // Generate cache key for user-specific balances (changes daily)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'outstanding-balances-user', entraId, today);

    const balancesData = await cacheWrapper(
      cacheKey,
      async () => {
        const fetchStart = Date.now();
        const accessToken = await getClioAccessToken();
        const connectionString = process.env.SQL_CONNECTION_STRING;

        // Get user's Clio ID from team data
        const userClioId = await withRequest(connectionString, async (request, sqlClient) => {
          request.input('entraId', sqlClient.NVarChar, entraId);
          const result = await request.query("SELECT [Clio ID] FROM team WHERE [Entra ID] = @entraId");
          return result.recordset?.[0]?.['Clio ID'];
        });
        
        if (!userClioId) {
          throw new Error('User not found');
        }
        
        // Fetch user's matters to get associated matter IDs
        const clioApiBaseUrl = 'https://eu.app.clio.com/api/v4';
        const mattersUrl = `${clioApiBaseUrl}/matters.json?fields=id&user_id=${userClioId}`;
        
        const fetchMatters = async (token) => fetch(mattersUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        let mattersResponse = await fetchMatters(accessToken);
        if (!mattersResponse.ok && mattersResponse.status === 401) {
          console.log('[OutstandingBalances] Access token invalid, clearing cache');
          cachedAccessToken = null;
          tokenExpiresAt = null;
          const freshToken = await getClioAccessToken();
          mattersResponse = await fetchMatters(freshToken);
        }

        if (!mattersResponse.ok) {
          throw new Error(`Clio matters API error: ${mattersResponse.status}`);
        }
        
        const mattersData = await mattersResponse.json();
        const matterIds = mattersData.data?.map(m => m.id) || [];
        
        if (matterIds.length === 0) {
          // No matters = no balances
          return { data: [] };
        }

        // Fetch minimal outstanding balances
        const outstandingFields = 'id,contact{id,name,first_name,last_name},total_outstanding_balance,last_payment_date,associated_matter_ids';
        const balancesUrl = `${clioApiBaseUrl}/outstanding_client_balances.json?fields=${encodeURIComponent(outstandingFields)}`;

        const response = await fetch(balancesUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Clio API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Filter to user's matters only
        const userBalances = {
          data: data.data?.filter(bal => 
            bal.associated_matter_ids?.some(id => matterIds.includes(id))
          ) || []
        };
        
        const fetchDuration = Date.now() - fetchStart;
        const dataSizeKB = JSON.stringify(userBalances).length / 1024;
        console.log(`[OutstandingBalances] User balances retrieved - ${fetchDuration}ms, ${dataSizeKB.toFixed(1)}KB, ${userBalances.data.length} records`);
        
        return userBalances;
      },
      1800 // 30 minutes TTL
    );
    
    res.json(balancesData);
  } catch (error) {
    console.error('[OutstandingBalances] Error retrieving user balances:', error.message || error);
    res.status(500).json({ error: 'Error retrieving outstanding balances' });
  }
});

/**
 * GET /api/outstanding-balances
 * Returns outstanding client balances from Clio API
 */
router.get('/', async (req, res) => {
  try {
    console.log('[OutstandingBalances] Fetching outstanding client balances from Clio');

    // Generate cache key for outstanding balances (changes daily)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'outstanding-balances-v2', today);

    const balancesData = await cacheWrapper(
      cacheKey,
      async () => {
        const fetchStart = Date.now();
        // Get Clio access token (cached or refreshed)
        const accessToken = await getClioAccessToken();

        // Clio API configuration - minimal fields for performance
        const clioApiBaseUrl = 'https://eu.app.clio.com/api/v4';
        // Only fetch essential fields: contact name/ID and total balance
        const outstandingFields = 'id,contact{id,name,first_name,last_name},total_outstanding_balance,last_payment_date,associated_matter_ids';
        const balancesUrl = `${clioApiBaseUrl}/outstanding_client_balances.json?fields=${encodeURIComponent(outstandingFields)}`;

        // Fetch from Clio API
        const response = await fetch(balancesUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OutstandingBalances] Clio API error:', errorText);
          
          // If token is invalid, clear cache and let user retry
          if (response.status === 401) {
            console.log('[OutstandingBalances] Access token invalid, clearing cache');
            cachedAccessToken = null;
            tokenExpiresAt = null;
          }
          
          throw new Error(`Clio API error: ${response.status}`);
        }

        const data = await response.json();
        const fetchDuration = Date.now() - fetchStart;
        const dataSizeKB = JSON.stringify(data).length / 1024;
        console.log(`[OutstandingBalances] Successfully retrieved balances data - ${fetchDuration}ms, ${dataSizeKB.toFixed(1)}KB, ${data?.data?.length || 0} records`);
        return data;
      },
      1800 // 30 minutes TTL - outstanding balances don't change frequently during the day
    );
    
    res.json(balancesData);
  } catch (error) {
    console.error('[OutstandingBalances] Error retrieving outstanding client balances:', error.message || error);
    // Don't leak error details to browser
    res.status(500).json({ 
      error: 'Error retrieving outstanding client balances'
    });
  }
});

/**
 * Get Clio access token (cached or refresh if expired)
 */
async function getClioAccessToken() {
  // Check if we have a cached token that's still valid
  if (cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    console.log('[OutstandingBalances] Using cached Clio access token');
    return cachedAccessToken;
  }

  console.log('[OutstandingBalances] Refreshing Clio access token');

  // Key Vault configuration
  const kvUri = 'https://helix-keys.vault.azure.net/';
  const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
  const secretClient = new SecretClient(kvUri, credential);

  // Fetch OAuth credentials from Key Vault
  const [refreshTokenSecret, clientSecretValue, clientIdSecret] = await Promise.all([
    secretClient.getSecret('clio-teamhubv1-refreshtoken'),
    secretClient.getSecret('clio-teamhubv1-secret'),
    secretClient.getSecret('clio-teamhubv1-clientid')
  ]);

  const refreshToken = refreshTokenSecret.value;
  const clientSecret = clientSecretValue.value;
  const clientId = clientIdSecret.value;

  if (!refreshToken || !clientSecret || !clientId) {
    throw new Error('One or more Clio OAuth credentials are missing from Key Vault');
  }

  // Request new access token from Clio
  const clioTokenUrl = 'https://eu.app.clio.com/oauth/token';
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const tokenResponse = await fetch(`${clioTokenUrl}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('[OutstandingBalances] Failed to refresh Clio token:', errorText);
    
    // Clear cache on failure
    cachedAccessToken = null;
    tokenExpiresAt = null;
    
    throw new Error(`Failed to obtain Clio access token (${tokenResponse.status}): ${errorText}. You may need to re-authenticate with Clio and update the refresh token in Key Vault.`);
  }

  const tokenData = await tokenResponse.json();
  
  // Clio returns a new refresh token on each refresh - store it back to Key Vault
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    console.log('[OutstandingBalances] Storing new refresh token to Key Vault');
    try {
      await secretClient.setSecret('clio-teamhubv1-refreshtoken', tokenData.refresh_token);
    } catch (kvError) {
      console.error('[OutstandingBalances] Failed to update refresh token in Key Vault:', kvError.message);
    }
  }
  
  // Cache the token (use expires_in from response, default to 55 minutes)
  const expiresInSeconds = tokenData.expires_in || 3600;
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = Date.now() + ((expiresInSeconds - 300) * 1000); // Refresh 5 minutes before expiry
  
  console.log(`[OutstandingBalances] Successfully refreshed Clio access token (expires in ${expiresInSeconds}s)`);
  return cachedAccessToken;
}

module.exports = router;
