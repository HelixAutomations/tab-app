/**
 * Outstanding Client Balances Routes
 * Fetches outstanding client balance data from Clio API
 */

const express = require('express');
const router = express.Router();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { getRedisClient, generateCacheKey, cacheWrapper } = require('../utils/redisClient');

// Cache for Clio access token (reuse across requests to avoid constant refreshes)
let cachedAccessToken = null;
let tokenExpiresAt = null;

/**
 * GET /api/outstanding-balances
 * Returns outstanding client balances from Clio API
 */
router.get('/', async (req, res) => {
  try {
    console.log('[OutstandingBalances] Fetching outstanding client balances from Clio');

    // Generate cache key for outstanding balances (changes daily)
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = generateCacheKey('metrics', 'outstanding-balances', today);

    const balancesData = await cacheWrapper(
      cacheKey,
      async () => {
        // Get Clio access token (cached or refreshed)
        const accessToken = await getClioAccessToken();

        // Clio API configuration
        const clioApiBaseUrl = 'https://eu.app.clio.com/api/v4';
        const outstandingFields = 'id,created_at,updated_at,associated_matter_ids,contact{id,etag,name,first_name,middle_name,last_name,date_of_birth,type,created_at,updated_at,prefix,title,initials,clio_connect_email,locked_clio_connect_email,client_connect_user_id,primary_email_address,secondary_email_address,primary_phone_number,secondary_phone_number,ledes_client_id,has_clio_for_clients_permission,is_client,is_clio_for_client_user,is_co_counsel,is_bill_recipient,sales_tax_number,currency},total_outstanding_balance,last_payment_date,last_shared_date,newest_issued_bill_due_date,pending_payments_total,reminders_enabled,currency{id,etag,code,sign,created_at,updated_at},outstanding_bills{id,etag,number,issued_at,created_at,due_at,tax_rate,secondary_tax_rate,updated_at,subject,purchase_order,type,memo,start_at,end_at,balance,state,kind,total,paid,paid_at,pending,due,discount_services_only,can_update,credits_issued,shared,last_sent_at,services_secondary_tax,services_sub_total,services_tax,services_taxable_sub_total,services_secondary_taxable_sub_total,taxable_sub_total,secondary_taxable_sub_total,sub_total,tax_sum,secondary_tax_sum,total_tax,available_state_transitions}';
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
        console.log('[OutstandingBalances] Successfully retrieved balances data');
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
