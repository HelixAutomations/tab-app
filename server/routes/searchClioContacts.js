const express = require('express');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const { URLSearchParams } = require('url');
const { cacheClioContacts, generateCacheKey, CACHE_CONFIG } = require('../utils/redisClient');

const router = express.Router();

/**
 * Search Clio for contacts by email addresses
 */
router.post('/', async (req, res) => {
  console.log('Clio contact search started');
  
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
  console.log(`🔍 Performing fresh Clio search for ${emails.length} emails`);
  
  // Key Vault URI and secret names
  const kvUri = "https://helix-keys.vault.azure.net/";
  const clioRefreshTokenSecretName = "clio-teamhubv1-refreshtoken";
  const clioSecretName = "clio-teamhubv1-secret";
  const clioClientIdSecretName = "clio-teamhubv1-clientid";

  // Clio endpoints
  const clioTokenUrl = "https://eu.app.clio.com/oauth/token";
  const clioApiBaseUrl = "https://eu.app.clio.com/api/v4";

  // Retrieve Clio OAuth credentials from Key Vault
  const credential = new DefaultAzureCredential();
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
    console.error('One or more Clio OAuth credentials are missing.');
    throw new Error('One or more Clio OAuth credentials are missing.');
  }

  console.log('Retrieved Clio OAuth credentials from Key Vault.');

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
    console.error('No access token received from Clio OAuth refresh.');
    throw new Error('No access token received from Clio OAuth refresh.');
  }

  console.log('Successfully refreshed Clio access token.');

  // Step 2: Search for contacts by each email
  const results = {};
  // Remove 'matters' from the contactFields as it's not a valid field for the contacts endpoint
  const contactFields = "id,name,primary_email_address,type";
  
  for (const email of emails) {
    try {
      console.log(`Searching for contact with email: ${email}`);
      
      // Try different Clio API approaches for email search
      // Approach 1: Use the /contacts endpoint and filter by email in results
      const searchUrl = `${clioApiBaseUrl}/contacts.json?fields=${encodeURIComponent(contactFields)}&limit=100`;
      
      console.log(`Clio API URL: ${searchUrl}`);
      
      const contactResponse = await fetch(searchUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        timeout: 15000 // 15 second timeout for contact search
      });

      if (!contactResponse.ok) {
        const errorText = await contactResponse.text();
        console.warn(`Failed to search contacts for ${email}: ${contactResponse.status} ${contactResponse.statusText}`);
        console.warn(`Clio API Error Response: ${errorText}`);
        console.warn(`Clio API URL that failed: ${searchUrl}`);
        results[email] = null;
        continue;
      }

      const contactData = await contactResponse.json();
      const contacts = contactData.data || [];
      
      console.log(`Retrieved ${contacts.length} contacts from Clio for email search: ${email}`);
      
      // Find exact email match from all contacts
      const matchingContact = contacts.find(contact => 
        contact.primary_email_address?.toLowerCase() === email.toLowerCase()
      );

      if (matchingContact) {
        console.log(`Found matching contact for ${email}: ${matchingContact.name} (ID: ${matchingContact.id})`);
        results[email] = {
          id: matchingContact.id,
          name: matchingContact.name,
          primary_email_address: matchingContact.primary_email_address,
          type: matchingContact.type,
          matters: [] // We'll fetch matters separately if needed
        };
      } else {
        console.log(`No matching contact found for ${email}`);
        results[email] = null;
      }

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error(`Error searching for contact ${email}:`, error);
      results[email] = null;
    }
  }

  const foundContacts = Object.values(results).filter(contact => contact !== null);
  console.log(`🎯 Clio search completed. Found ${foundContacts.length} contacts out of ${emails.length} emails searched.`);

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