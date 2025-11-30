/**
 * DIRECT Clio Matter Opening for HLX-28851-39959
 * 
 * This script bypasses the deployed server and calls Clio API directly.
 * It fetches secrets from Azure Key Vault and creates the matter.
 * 
 * Run: node open-matter-direct-28851.js
 */
require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');

const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

// Practice area mapping (the fix we made)
const PRACTICE_AREAS = {
    "Miscellaneous": 948830,
    "Miscellaneous (None of the above)": 948830,
};

const VALUE_OPTIONS = {
    "Less than £10k": 244802,
    "£10k - £500k": 244805,
    "£501k - £1m": 244808,
    "£1m - £5m": 244811,
    "£5m - £20m": 244814,
    "Over £20m": 244817
};

async function getSecret(name) {
    const secret = await secretClient.getSecret(name);
    return secret.value;
}

async function getClioAccessToken(initials) {
    const lower = initials.toLowerCase();
    console.log(`  Fetching Clio credentials for ${lower}...`);
    
    const clientId = await getSecret(`${lower}-clio-v1-clientid`);
    const clientSecret = await getSecret(`${lower}-clio-v1-clientsecret`);
    const refreshToken = await getSecret(`${lower}-clio-v1-refreshtoken`);
    
    console.log('  Refreshing Clio access token...');
    const tokenUrl = `https://eu.app.clio.com/oauth/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=refresh_token&refresh_token=${refreshToken}`;
    
    const resp = await fetch(tokenUrl, { method: 'POST' });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Token refresh failed: ${resp.status} ${text}`);
    }
    
    const { access_token } = await resp.json();
    console.log('  ✓ Access token obtained');
    return access_token;
}

async function getClioIdForInitials(initials) {
    console.log(`  Looking up Clio ID for ${initials}...`);
    const connString = process.env.SQL_CONNECTION_STRING;
    if (!connString) throw new Error('SQL_CONNECTION_STRING not set');
    
    const pool = await sql.connect(connString);
    const result = await pool.request()
        .input('initials', sql.NVarChar, initials)
        .query('SELECT [Clio ID] FROM dbo.team WHERE Initials = @initials');
    
    await pool.close();
    
    const clioId = result.recordset?.[0]?.['Clio ID'];
    if (!clioId) throw new Error(`No Clio ID found for initials: ${initials}`);
    
    console.log(`  ✓ Clio ID: ${clioId}`);
    return clioId;
}

async function fetchInstruction(instructionRef) {
    console.log(`  Fetching instruction ${instructionRef} from database...`);
    // Instructions are in a separate database
    const connString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    if (!connString) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not set');
    
    const pool = await sql.connect(connString);
    const result = await pool.request()
        .input('ref', sql.NVarChar, instructionRef)
        .query(`SELECT * FROM Instructions WHERE InstructionRef = @ref`);
    
    await pool.close();
    
    const inst = result.recordset?.[0];
    if (!inst) throw new Error(`Instruction not found: ${instructionRef}`);
    
    console.log('  ✓ Instruction found');
    return inst;
}

async function findOrCreateContact(inst, headers, clientType) {
    // First try to find existing contact by email
    const email = inst.Email;
    if (email) {
        console.log(`  Searching for existing contact with email: ${email}`);
        const searchUrl = `https://eu.app.clio.com/api/v4/contacts.json?query=${encodeURIComponent(email)}&type=${clientType === 'Company' ? 'Company' : 'Person'}`;
        const searchResp = await fetch(searchUrl, { headers });
        
        if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.data && searchData.data.length > 0) {
                const existing = searchData.data[0];
                console.log(`  ✓ Found existing contact: ${existing.id} (${existing.name || existing.first_name + ' ' + existing.last_name})`);
                return existing.id;
            }
        }
    }
    
    // Create new contact
    console.log('  Creating new contact in Clio...');
    let contactPayload;
    
    if (clientType === 'Company') {
        contactPayload = {
            data: {
                type: 'Company',
                name: inst.CompanyName || inst.Company,
                email_addresses: email ? [{ name: 'Work', address: email, default_email: true }] : [],
                phone_numbers: inst.Phone ? [{ name: 'Work', number: inst.Phone, default_number: true }] : [],
                addresses: [{
                    name: 'Work',
                    street: `${inst.CompanyHouseNumber || inst.HouseNumber || ''} ${inst.CompanyStreet || inst.Street || ''}`.trim(),
                    city: inst.CompanyCity || inst.City || '',
                    province: inst.CompanyCounty || inst.County || '',
                    postal_code: inst.CompanyPostcode || inst.Postcode || '',
                    country: inst.CompanyCountry || inst.Country || ''
                }]
            }
        };
    } else {
        contactPayload = {
            data: {
                type: 'Person',
                first_name: inst.FirstName || inst.First || '',
                last_name: inst.LastName || inst.Last || '',
                email_addresses: email ? [{ name: 'Home', address: email, default_email: true }] : [],
                phone_numbers: inst.Phone ? [{ name: 'Home', number: inst.Phone, default_number: true }] : []
            }
        };
    }
    
    const createResp = await fetch('https://eu.app.clio.com/api/v4/contacts.json', {
        method: 'POST',
        headers,
        body: JSON.stringify(contactPayload)
    });
    
    if (!createResp.ok) {
        const text = await createResp.text();
        throw new Error(`Failed to create contact: ${createResp.status} ${text}`);
    }
    
    const { data } = await createResp.json();
    console.log(`  ✓ Created contact: ${data.id}`);
    return data.id;
}

async function createMatter(contactId, inst, feeEarnerClioId, originatingClioId, headers) {
    const instructionRef = 'HLX-28851-39959';
    const description = 'Advice on Covenants';
    const practiceArea = 'Miscellaneous';
    const supervisingPartner = 'Alex';
    
    const practiceAreaId = PRACTICE_AREAS[practiceArea];
    if (!practiceAreaId) {
        throw new Error(`Practice area not mapped: ${practiceArea}`);
    }
    
    const customFields = [
        { value: supervisingPartner, custom_field: { id: 232574 } },
        { value: instructionRef, custom_field: { id: 380722 } }
    ];
    
    const payload = {
        data: {
            billable: true,
            client: { id: contactId },
            client_reference: instructionRef,
            description: description,
            practice_area: { id: practiceAreaId },
            responsible_attorney: { id: feeEarnerClioId },
            originating_attorney: { id: originatingClioId },
            status: 'Open',
            custom_field_values: customFields
        }
    };
    
    console.log('\n  Creating matter with payload:');
    console.log('  - Client ID:', contactId);
    console.log('  - Description:', description);
    console.log('  - Practice Area ID:', practiceAreaId);
    console.log('  - Fee Earner Clio ID:', feeEarnerClioId);
    console.log('  - Originating Clio ID:', originatingClioId);
    
    const resp = await fetch('https://eu.app.clio.com/api/v4/matters.json', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
    });
    
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Failed to create matter: ${resp.status} ${text}`);
    }
    
    const { data } = await resp.json();
    return data;
}

async function main() {
    console.log('='.repeat(60));
    console.log('DIRECT CLIO MATTER OPENING: HLX-28851-39959');
    console.log('='.repeat(60));
    
    const instructionRef = 'HLX-28851-39959';
    const feeEarnerInitials = 'SP';
    const originatingInitials = 'SP';
    const clientType = 'Company';
    
    try {
        // Step 1: Get instruction data
        console.log('\n[1/5] Fetching instruction data...');
        const inst = await fetchInstruction(instructionRef);
        console.log('  Company:', inst.CompanyName || inst.Company);
        console.log('  Contact:', inst.FirstName, inst.LastName);
        console.log('  Email:', inst.Email);
        
        // Step 2: Get Clio access token
        console.log('\n[2/5] Authenticating with Clio...');
        const accessToken = await getClioAccessToken(feeEarnerInitials);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        };
        
        // Step 3: Get Clio IDs for team members
        console.log('\n[3/5] Looking up team Clio IDs...');
        const feeEarnerClioId = await getClioIdForInitials(feeEarnerInitials);
        const originatingClioId = await getClioIdForInitials(originatingInitials);
        
        // Step 4: Find or create contact
        console.log('\n[4/5] Finding/creating Clio contact...');
        const contactId = await findOrCreateContact(inst, headers, clientType);
        
        // Step 5: Create the matter
        console.log('\n[5/5] Creating Clio matter...');
        const matter = await createMatter(contactId, inst, feeEarnerClioId, originatingClioId, headers);
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 SUCCESS! Matter created in Clio');
        console.log('='.repeat(60));
        console.log('📋 Matter ID:', matter.id);
        console.log('📋 Display Number:', matter.display_number);
        console.log('📋 Client Reference:', matter.client_reference);
        console.log('📋 Description:', matter.description);
        console.log('📋 Status:', matter.status);
        console.log('\n✓ Done!');
        
    } catch (err) {
        console.error('\n❌ ERROR:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

main();
