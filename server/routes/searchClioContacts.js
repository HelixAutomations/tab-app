const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { URLSearchParams } = require('url');
const { cacheClioContacts, generateCacheKey, CACHE_CONFIG } = require('../utils/redisClient');

const router = express.Router();

const maskEmailForLogs = (email) => {
  if (!email || typeof email !== 'string') return '[unknown-email]';
  const [localPart = '', domainPart = ''] = email.split('@');
  if (!domainPart) return `${localPart.slice(0, 2)}***`;
  return `${localPart.slice(0, 2)}***@${domainPart}`;
};

/**
 * Search Clio for contacts by email addresses
 */
router.post('/', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'emails array is required and must contain at least one email.' 
      });
    }

    // Generate cache key based on sorted emails to ensure consistent caching
    const sortedEmails = emails.slice().sort();
    const cacheKey = generateCacheKey(
      CACHE_CONFIG.PREFIXES.CLIO, 
      'contacts', 
      'bulk-search',
      sortedEmails.join(',')
    );

    // Use Redis cache wrapper for the entire search operation
    const result = await cacheClioContacts([sortedEmails.join(',')], async () => {
      return await performClioContactSearch(emails);
    });

    res.json(result);

  } catch (error) {
    console.error('Error in searchClioContacts route:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while searching Clio contacts',
      details: error.message
    });
  }
});

/**
 * Perform the actual Clio contact search (extracted for caching)
 */
async function performClioContactSearch(emails) {
  // Key Vault URI and secret names
  const kvUri = "https://helix-keys.vault.azure.net/";
  const clioRefreshTokenSecretName = "clio-teamhubv1-refreshtoken";
  const clioSecretName = "clio-teamhubv1-secret";
  const clioClientIdSecretName = "clio-teamhubv1-clientid";

  // Clio endpoints
  const clioTokenUrl = "https://eu.app.clio.com/oauth/token";
  const clioApiBaseUrl = "https://eu.app.clio.com/api/v4";

  // Retrieve Clio OAuth credentials from Key Vault
  const credential = new DefaultAzureCredential({ additionallyAllowedTenants: ['*'] });
  const secretClient = new SecretClient(kvUri, credential);

  const [refreshTokenSecret, clientSecret, clientIdSecret] = await Promise.all([
    secretClient.getSecret(clioRefreshTokenSecretName),
    secretClient.getSecret(clioSecretName),
    secretClient.getSecret(clioClientIdSecretName),
  ]);

  const refreshToken = refreshTokenSecret.value;
  const clientSecretValue = clientSecret.value;
  const clientId = clientIdSecret.value;

  if (!refreshToken || !clientSecretValue || !clientId) {
    throw new Error('One or more Clio OAuth credentials are missing.');
  }

  // Step 1: Get a fresh access token using the refresh token
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecretValue,
  });

  const tokenResponse = await fetch(`${clioTokenUrl}?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000 // 10 second timeout for token refresh
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error(`Failed to refresh Clio access token: ${tokenResponse.status} ${tokenResponse.statusText}`, errorText);
    throw new Error(`Failed to refresh Clio access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error('No access token received from Clio OAuth refresh.');
  }

  // Step 2: Search for contacts by each email using Clio's query parameter
  const results = {};
  const contactFields = "id,name,primary_email_address,type";
  
  for (const email of emails) {
    try {
      const maskedEmail = maskEmailForLogs(email);
      
      // Use Clio's query parameter for server-side email filtering
      // This searches across contact fields including email, much more efficient
      // than fetching all contacts and filtering locally
      const queryUrl = `${clioApiBaseUrl}/contacts.json?fields=${encodeURIComponent(contactFields)}&query=${encodeURIComponent(email)}&limit=10`;
      
      const contactResponse = await fetch(queryUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      });

      if (!contactResponse.ok) {
        results[email] = null;
        continue;
      }

      const contactData = await contactResponse.json();
      const contacts = contactData.data || [];
      
      // Find exact email match from filtered results
      const matchingContact = contacts.find(contact => 
        contact.primary_email_address?.toLowerCase() === email.toLowerCase()
      );

      if (matchingContact) {
        results[email] = {
          id: matchingContact.id,
          name: matchingContact.name,
          primary_email_address: matchingContact.primary_email_address,
          type: matchingContact.type,
          matters: []
        };
      } else {
        results[email] = null;
      }

      // Rate limiting delay between Clio API calls
      if (emails.indexOf(email) < emails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      
    } catch (error) {
      results[email] = null;
    }
  }

  const foundContacts = Object.values(results).filter(contact => contact !== null);

  return {
    success: true,
    results,
    summary: {
      totalSearched: emails.length,
      totalFound: foundContacts.length,
      totalWithMatters: 0 // Not fetching matters data in this simplified version
    }
  };
}

module.exports = router;