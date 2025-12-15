const express = require('express');
const { getSecret } = require('../utils/getSecret');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.clio;

/**
 * Search for Clio clients by email address
 * Returns basic client information for linking purposes
 */
router.get('/search', async (req, res) => {
    const { email, initials, emailTypes = 'primary' } = req.query;
    
    if (!email || !initials) {
        return res.status(400).json({ error: 'Missing email or initials parameter' });
    }

    const typesToSearch = emailTypes.split(',').map(t => t.trim());
    log.debug(`Searching for client with email: ${email}, initials: ${initials}, emailTypes: ${typesToSearch}`);

    try {
        // Fetch Clio credentials
        const clioClientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        if (!clioClientId || !clientSecret || !refreshToken) {
            return res.status(500).json({ error: 'Clio credentials not found for user' });
        }

        // Refresh access token
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clioClientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        
        if (!tokenResp.ok) {
            const text = await tokenResp.text();
            log.error('Clio token refresh failed', text);
            return res.status(500).json({ error: 'Token refresh failed' });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Search for clients in Clio by email
        // Try multiple search approaches for better results
        const searchQueries = [
            email, // exact email search first
            `"${email}"`, // quoted exact search
            email.split('@')[0] // username part only as fallback
        ];
        
        let allClients = [];
        
        for (const query of searchQueries) {
            const searchUrl = `https://eu.app.clio.com/api/v4/contacts.json?fields=id,name,first_name,last_name,primary_email_address,primary_phone_number,type,email_addresses&query=${encodeURIComponent(query)}&limit=20`;
            
            log.debug(`Searching Clio with query: ${query}`);
            log.debug(`Search URL: ${searchUrl}`);
            
            const searchResp = await fetch(searchUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (searchResp.ok) {
                const searchData = await searchResp.json();
                log.debug(`Search results for "${query}":`, JSON.stringify(searchData, null, 2));
                
                if (searchData.data && searchData.data.length > 0) {
                    allClients.push(...searchData.data);
                    break; // Found results, no need to try other queries
                }
            } else {
                log.error(`Search failed for query "${query}":`, await searchResp.text());
            }
        }
        
        // Filter and deduplicate results based on selected email types
        log.debug(`Filtering ${allClients.length} clients. Email types to search: ${typesToSearch.join(', ')}`);
        log.debug(`Search email: "${email}"`);
        log.debug(`All clients found:`, allClients.map(c => ({
            id: c.id,
            name: c.name,
            primary_email: c.primary_email_address,
            email_addresses: c.email_addresses
        })));
        
        const uniqueClients = allClients.filter((client, index, arr) => {
            // Remove duplicates by ID first
            const isDuplicate = arr.findIndex(c => c.id === client.id) !== index;
            if (isDuplicate) {
                log.debug(`Skipping duplicate client ID: ${client.id}`);
                return false;
            }
            
            const searchEmail = email.toLowerCase();
            log.debug(`Checking client ${client.name} (ID: ${client.id}) for email match...`);
            
            // Check primary email if selected
            if (typesToSearch.includes('primary')) {
                const primaryEmail = client.primary_email_address?.toLowerCase();
                log.debug(`  Primary email check: "${primaryEmail}" === "${searchEmail}" ?`);
                if (primaryEmail && primaryEmail === searchEmail) {
                    log.debug(`✅ Found exact match by primary email: ${client.name} - ${primaryEmail}`);
                    return true;
                }
            }
            
            // Check secondary email addresses if home or other are selected
            if ((typesToSearch.includes('home') || typesToSearch.includes('other')) && 
                client.email_addresses && Array.isArray(client.email_addresses)) {
                
                const hasMatchingEmail = client.email_addresses.some(emailObj => {
                    const addr = emailObj.address?.toLowerCase();
                    const emailType = emailObj.type?.toLowerCase();
                    
                    if (addr === searchEmail) {
                        // Check if this email type is requested
                        if (typesToSearch.includes('home') && emailType === 'home') {
                            log.debug(`✅ Found exact match by home email: ${client.name} - ${addr}`);
                            return true;
                        }
                        if (typesToSearch.includes('other') && (emailType === 'work' || emailType === 'business' || emailType === 'other')) {
                            log.debug(`✅ Found exact match by other email (${emailType}): ${client.name} - ${addr}`);
                            return true;
                        }
                    }
                    return false;
                });
                if (hasMatchingEmail) return true;
            }
            
            log.debug(`❌ No match found for client ${client.name}`);
            return false;
        });

        log.debug(`Found ${uniqueClients.length} unique matching clients:`, uniqueClients);

        // Format the response
        const clients = uniqueClients
            .filter(contact => contact.type === 'Person' || contact.type === 'Company')
            .map(contact => ({
                id: contact.id?.toString(),
                name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
                firstName: contact.first_name,
                lastName: contact.last_name,
                email: contact.primary_email_address,
                phone: contact.primary_phone_number,
                type: contact.type
            }));

        res.json({
            success: true,
            clients,
            searchTerm: email,
            total: clients.length
        });

    } catch (err) {
        log.error('Clio client lookup error', err);
        res.status(500).json({ 
            error: 'Failed to search Clio clients', 
            details: err.message 
        });
    }
});

/**
 * Get specific client details by Clio client ID
 * Used for fetching full details of already linked clients
 */
router.get('/client/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const { initials } = req.query;
    
    if (!clientId || !initials) {
        return res.status(400).json({ error: 'Missing clientId or initials parameter' });
    }

    try {
        // Fetch Clio credentials
        const clioClientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        // Refresh access token
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clioClientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        
        if (!tokenResp.ok) {
            log.error('Clio token refresh failed');
            return res.status(500).json({ error: 'Token refresh failed' });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Get specific client from Clio
        const clientUrl = `https://eu.app.clio.com/api/v4/contacts/${clientId}?fields=id,name,first_name,last_name,primary_email_address,primary_phone_number,type`;
        
        const clientResp = await fetch(clientUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!clientResp.ok) {
            if (clientResp.status === 404) {
                return res.status(404).json({ error: 'Client not found in Clio' });
            }
            log.error('Clio client fetch failed');
            return res.status(500).json({ error: 'Failed to fetch client from Clio' });
        }

        const clientData = await clientResp.json();
        const contact = clientData.data;

        const client = {
            id: contact.id?.toString(),
            name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
            firstName: contact.first_name,
            lastName: contact.last_name,
            email: contact.primary_email_address,
            phone: contact.primary_phone_number,
            type: contact.type
        };

        res.json({
            success: true,
            client
        });

    } catch (err) {
        log.error('Clio client fetch error', err);
        res.status(500).json({ 
            error: 'Failed to fetch client from Clio', 
            details: err.message 
        });
    }
});

/**
 * Get custom field values for a specific client by Clio client ID
 * Used for fetching custom field data to display additional client information
 */
router.get('/client/:clientId/custom-fields', async (req, res) => {
    const { clientId } = req.params;
    const { initials } = req.query;
    
    if (!clientId || !initials) {
        return res.status(400).json({ error: 'Missing clientId or initials parameter' });
    }

    log.debug(`Fetching custom fields for client ID: ${clientId}, initials: ${initials}`);

    try {
        // Fetch Clio credentials
        const clioClientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        if (!clioClientId || !clientSecret || !refreshToken) {
            log.error('Clio credentials not found for user');
            return res.status(500).json({ error: 'Clio credentials not found for user' });
        }

        // Refresh access token
        const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clioClientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
        const tokenResp = await fetch(tokenUrl, { method: 'POST' });
        
        if (!tokenResp.ok) {
            const tokenError = await tokenResp.text();
            log.error('Clio token refresh failed', tokenError);
            return res.status(500).json({ error: 'Token refresh failed' });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Get client with custom field values from Clio
        const clientUrl = `https://eu.app.clio.com/api/v4/contacts/${clientId}?fields=custom_field_values{id,field_name,value}`;
        
        log.debug(`Fetching custom fields from: ${clientUrl}`);
        
        const clientResp = await fetch(clientUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!clientResp.ok) {
            if (clientResp.status === 404) {
                log.error('Client not found in Clio');
                return res.status(404).json({ error: 'Client not found in Clio' });
            }
            const clientError = await clientResp.text();
            log.error('Clio custom fields fetch failed', clientError);
            return res.status(500).json({ error: 'Failed to fetch custom fields from Clio' });
        }

        const clientData = await clientResp.json();
        log.debug(`Custom fields data:`, JSON.stringify(clientData, null, 2));
        
        const customFieldValues = clientData.data?.custom_field_values || [];

        res.json({
            success: true,
            custom_field_values: customFieldValues
        });

    } catch (err) {
        log.error('Clio custom fields fetch error', err);
        res.status(500).json({ 
            error: 'Failed to fetch custom fields from Clio', 
            details: err.message 
        });
    }
});

// Quick search test endpoint (no filtering)
router.get('/search-raw', async (req, res) => {
    const { email, initials } = req.query;
    
    if (!email || !initials) {
        return res.status(400).json({ error: 'Missing email or initials parameter' });
    }

    try {
        // Fetch Clio credentials
        const clioClientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        if (!clioClientId || !clientSecret || !refreshToken) {
            return res.status(500).json({ error: 'Missing Clio credentials' });
        }

        // Refresh the access token
        const tokenResp = await fetch('https://eu.app.clio.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clioClientId,
                client_secret: clientSecret
            })
        });
        
        if (!tokenResp.ok) {
            return res.status(500).json({ error: 'Token refresh failed' });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Simple search - just return what Clio gives us
        const searchUrl = `https://eu.app.clio.com/api/v4/contacts.json?fields=id,name,first_name,last_name,primary_email_address,primary_phone_number,type,email_addresses&query=${encodeURIComponent(email)}&limit=5`;
        
        const searchResp = await fetch(searchUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!searchResp.ok) {
            return res.status(500).json({ error: 'Clio search failed' });
        }

        const searchData = await searchResp.json();

        res.json({
            success: true,
            searchTerm: email,
            rawResponse: searchData,
            clientsFound: searchData.data?.length || 0
        });

    } catch (error) {
        log.error('Error in raw search:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Quick test endpoint for specific client debugging
router.get('/debug/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const { initials } = req.query;
    
    if (!initials) {
        return res.status(400).json({ error: 'Missing initials parameter' });
    }

    try {
        // Fetch Clio credentials
        const clioClientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        if (!clioClientId || !clientSecret || !refreshToken) {
            return res.status(500).json({ error: 'Missing Clio credentials' });
        }

        // Refresh the access token
        const tokenResp = await fetch('https://eu.app.clio.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clioClientId,
                client_secret: clientSecret
            })
        });
        
        if (!tokenResp.ok) {
            const text = await tokenResp.text();
            log.error('Clio token refresh failed', text);
            return res.status(500).json({ error: 'Token refresh failed' });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Test different endpoint variations
        const endpoints = [
            `https://eu.app.clio.com/api/v4/contacts/${clientId}.json`,
            `https://eu.app.clio.com/api/v4/contacts/${clientId}.json?fields=id,name,first_name,last_name,primary_email_address,primary_phone_number,type,email_addresses{id,address,type}`,
            `https://eu.app.clio.com/api/v4/contacts/${clientId}.json?fields=custom_field_values{id,field_name,value}`
        ];

        const results = {};

        for (let i = 0; i < endpoints.length; i++) {
            const endpoint = endpoints[i];
            log.debug(`Testing endpoint ${i + 1}: ${endpoint}`);
            
            const clientResp = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (clientResp.ok) {
                const clientData = await clientResp.json();
                results[`endpoint_${i + 1}`] = {
                    url: endpoint,
                    data: clientData
                };
            } else {
                const errorText = await clientResp.text();
                results[`endpoint_${i + 1}`] = {
                    url: endpoint,
                    error: errorText
                };
            }
        }

        res.json({
            success: true,
            clientId,
            results
        });

    } catch (error) {
        log.error('Error in debug endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test endpoint to fetch a specific client by ID to understand structure
router.get('/test/:clientId', async (req, res) => {
    const { clientId } = req.params;
    const { initials } = req.query;
    
    if (!initials) {
        return res.status(400).json({ error: 'Missing initials parameter' });
    }

    try {
        // Fetch Clio credentials
        const clioClientId = await getSecret(`${initials.toLowerCase()}-clio-v1-clientid`);
        const clientSecret = await getSecret(`${initials.toLowerCase()}-clio-v1-clientsecret`);
        const refreshToken = await getSecret(`${initials.toLowerCase()}-clio-v1-refreshtoken`);

        if (!clioClientId || !clientSecret || !refreshToken) {
            return res.status(500).json({ error: 'Missing Clio credentials' });
        }

        // Refresh the access token
        const tokenResp = await fetch('https://eu.app.clio.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clioClientId,
                client_secret: clientSecret
            })
        });
        
        if (!tokenResp.ok) {
            const text = await tokenResp.text();
            log.error('Clio token refresh failed', text);
            return res.status(500).json({ error: 'Token refresh failed' });
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        // Fetch specific client with all fields
        const clientUrl = `https://eu.app.clio.com/api/v4/contacts/${clientId}.json`;
        
        log.debug(`Fetching client details from: ${clientUrl}`);
        
        const clientResp = await fetch(clientUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!clientResp.ok) {
            const errorText = await clientResp.text();
            log.error('Clio client fetch failed', errorText);
            return res.status(500).json({ error: 'Client fetch failed' });
        }

        const clientData = await clientResp.json();
        log.debug('Full client data:', JSON.stringify(clientData, null, 2));

        res.json({
            success: true,
            client: clientData
        });

    } catch (error) {
        log.error('Error in test client fetch:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
