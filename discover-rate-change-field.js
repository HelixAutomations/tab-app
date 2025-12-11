/**
 * Discover the "Date of Rate Change" custom field ID from Clio
 * Run: node discover-rate-change-field.js
 */
require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

async function getSecret(name) {
    const secret = await secretClient.getSecret(name);
    return secret.value;
}

async function main() {
    const initials = 'lz'; // Use LZ's credentials
    
    console.log('Fetching Clio credentials...');
    const [clientId, clientSecret, refreshToken] = await Promise.all([
        getSecret(`${initials}-clio-v1-clientid`),
        getSecret(`${initials}-clio-v1-clientsecret`),
        getSecret(`${initials}-clio-v1-refreshtoken`),
    ]);
    
    console.log('Getting Clio access token...');
    const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
    const tokenResp = await fetch(tokenUrl, { method: 'POST' });
    if (!tokenResp.ok) throw new Error('Failed to get Clio access token');
    const { access_token } = await tokenResp.json();
    
    console.log('Fetching Matter custom fields from Clio...\n');
    const cfUrl = 'https://eu.app.clio.com/api/v4/custom_fields.json?fields=id,name,parent_type,field_type,displayed,deleted&parent_type=Matter';
    const cfResp = await fetch(cfUrl, {
        headers: { Authorization: `Bearer ${access_token}` }
    });
    
    if (!cfResp.ok) throw new Error(`Failed to get custom fields: ${cfResp.status}`);
    const cfData = await cfResp.json();
    
    const fields = (cfData.data || []).filter(f => !f.deleted);
    
    console.log('All Matter Custom Fields:');
    console.log('=' .repeat(80));
    fields.forEach(f => {
        console.log(`ID: ${f.id.toString().padEnd(10)} | Type: ${(f.field_type || '').padEnd(12)} | Name: ${f.name}`);
    });
    
    console.log('\n' + '=' .repeat(80));
    console.log('Fields containing "rate" or "change":');
    console.log('=' .repeat(80));
    
    const rateFields = fields.filter(f => 
        f.name.toLowerCase().includes('rate') || 
        f.name.toLowerCase().includes('change')
    );
    
    if (rateFields.length === 0) {
        console.log('None found. You may need to create a "Date of Rate Change" custom field in Clio.');
    } else {
        rateFields.forEach(f => {
            console.log(`ID: ${f.id} | Type: ${f.field_type} | Name: ${f.name}`);
        });
    }
    
    // Also look for date fields
    console.log('\n' + '=' .repeat(80));
    console.log('All DATE type fields:');
    console.log('=' .repeat(80));
    const dateFields = fields.filter(f => f.field_type === 'date');
    dateFields.forEach(f => {
        console.log(`ID: ${f.id} | Name: ${f.name}`);
    });
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
