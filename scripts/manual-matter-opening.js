/**
 * Manual Matter Opening Utility
 * 
 * This is a reusable script for manually opening matters in Clio when the
 * automated workflow fails. It bypasses the deployed server and calls Clio API directly.
 * 
 * USAGE:
 *   node scripts/manual-matter-opening.js <instruction-ref> <fee-earner-initials> [originating-initials]
 * 
 * EXAMPLES:
 *   node scripts/manual-matter-opening.js HLX-28960-19062 BR
 *   node scripts/manual-matter-opening.js HLX-28639-58516 RC RC
 * 
 * PREREQUISITES:
 *   - .env file with SQL_CONNECTION_STRING and INSTRUCTIONS_SQL_CONNECTION_STRING
 *   - Azure Key Vault access (uses DefaultAzureCredential)
 *   - Clio OAuth credentials stored in Key Vault as: <initials>-clio-v1-clientid, etc.
 * 
 * WHAT THIS SCRIPT DOES:
 *   1. Fetches instruction data from SQL database
 *   2. Authenticates with Clio using user-specific OAuth credentials from Key Vault
 *   3. Looks up Clio IDs for fee earner and originating solicitor
 *   4. Finds existing contact by email or creates a new one
 *   5. Creates the matter in Clio with proper custom fields
 * 
 * PRACTICE AREA MAPPING:
 *   The script requires manual mapping of practice areas to Clio IDs.
 *   Common mappings:
 *     - Employment -> 918866
 *     - Insolvency - Personal -> 919594
 *     - Commercial Disputes -> 918856
 *     - Property Disputes -> 919090
 *   
 *   See Clio API for full list: GET /api/v4/practice_areas
 * 
 * CUSTOM FIELDS:
 *   - Supervising Partner (ID: 232574)
 *   - Instruction Reference (ID: 380722)
 */

require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');

// Configuration - EDIT THESE FOR EACH USE
const CONFIG = {
    instructionRef: process.argv[2] || 'HLX-XXXXX-XXXXX',
    feeEarnerInitials: process.argv[3] || 'XX',
    originatingInitials: process.argv[4] || process.argv[3] || 'XX',
    
    // Practice area - MUST be set manually based on the case type
    // Run with --list-practice-areas to see all options
    practiceAreaId: null, // Set this or use --practice-area flag
    
    // Supervising partner name (for custom field)
    supervisingPartner: null, // Will be looked up from team table if not set
    
    // Description override (optional - will use instruction data if not set)
    description: null
};

// Azure Key Vault setup
const credential = new DefaultAzureCredential();
const vaultUrl = process.env.KEY_VAULT_URL || 'https://helix-keys.vault.azure.net/';
const secretClient = new SecretClient(vaultUrl, credential);

// Clio custom field IDs
const CUSTOM_FIELDS = {
    SUPERVISING_PARTNER: 232574,
    INSTRUCTION_REF: 380722
};

// Common practice area mappings
const PRACTICE_AREAS = {
    'employment': 918866,
    'post termination dispute': 918866,
    'insolvency - personal': 919594,
    'bankruptcy': 919594,
    'commercial disputes': 918856,
    'commercial': 918856,
    'property disputes': 919090,
    'property': 919090,
    'contract disputes': 918860,
    'professional negligence': 919076
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

async function getTeamMember(initials) {
    console.log(`  Looking up team member ${initials}...`);
    const connString = process.env.SQL_CONNECTION_STRING;
    if (!connString) throw new Error('SQL_CONNECTION_STRING not set');
    
    const pool = await sql.connect(connString);
    const result = await pool.request()
        .input('initials', sql.NVarChar, initials.toUpperCase())
        .query('SELECT [Clio ID], [Full Name], Initials FROM dbo.team WHERE UPPER(Initials) = @initials');
    
    await pool.close();
    
    const member = result.recordset?.[0];
    if (!member) throw new Error(`No team member found for initials: ${initials}`);
    
    console.log(`  ✓ Found: ${member['Full Name']} (Clio ID: ${member['Clio ID']})`);
    return {
        clioId: member['Clio ID'],
        fullName: member['Full Name'],
        initials: member['Initials']
    };
}

async function fetchInstruction(instructionRef) {
    console.log(`  Fetching instruction ${instructionRef} from database...`);
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
    console.log(`    Name: ${inst.FirstName || inst.First || ''} ${inst.LastName || inst.Last || ''}`);
    console.log(`    Email: ${inst.Email || 'N/A'}`);
    console.log(`    Practice Area: ${inst.PracticeArea || inst.AreaOfWork || 'N/A'}`);
    
    return inst;
}

async function findOrCreateContact(inst, headers) {
    const email = inst.Email;
    
    // First try to find existing contact by email
    if (email) {
        console.log(`  Searching for existing contact with email: ${email}`);
        const searchUrl = `https://eu.app.clio.com/api/v4/contacts.json?query=${encodeURIComponent(email)}&type=Person`;
        const searchResp = await fetch(searchUrl, { headers });
        
        if (searchResp.ok) {
            const searchData = await searchResp.json();
            if (searchData.data && searchData.data.length > 0) {
                const existing = searchData.data[0];
                console.log(`  ✓ Found existing contact: ${existing.id} (${existing.name || `${existing.first_name} ${existing.last_name}`})`);
                return existing.id;
            }
        }
    }
    
    // Create new contact
    console.log('  Creating new contact in Clio...');
    const contactPayload = {
        data: {
            type: 'Person',
            first_name: inst.FirstName || inst.First || '',
            last_name: inst.LastName || inst.Last || '',
            email_addresses: email ? [{ name: 'Home', address: email, default_email: true }] : [],
            phone_numbers: inst.Phone ? [{ name: 'Home', number: inst.Phone, default_number: true }] : [],
            addresses: [{
                name: 'Home',
                street: `${inst.HouseNumber || ''} ${inst.Street || ''}`.trim(),
                city: inst.City || '',
                province: inst.County || '',
                postal_code: inst.Postcode || inst.PostCode || '',
                country: inst.Country || 'United Kingdom'
            }]
        }
    };
    
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

async function createMatter(contactId, feeEarner, originating, inst, headers, config) {
    const description = config.description || inst.Description || inst.ServiceDescription || 'Legal Services';
    const supervisingPartner = config.supervisingPartner || 'Alex'; // Default supervising partner
    
    // Determine practice area ID
    let practiceAreaId = config.practiceAreaId;
    if (!practiceAreaId) {
        const practiceArea = (inst.PracticeArea || inst.AreaOfWork || '').toLowerCase();
        practiceAreaId = PRACTICE_AREAS[practiceArea];
        if (!practiceAreaId) {
            console.error(`\n❌ Unknown practice area: "${practiceArea}"`);
            console.error('Please specify --practice-area=<id> or add to PRACTICE_AREAS mapping');
            console.error('\nKnown practice areas:', Object.keys(PRACTICE_AREAS).join(', '));
            throw new Error('Practice area mapping not found');
        }
    }
    
    const customFields = [
        { value: supervisingPartner, custom_field: { id: CUSTOM_FIELDS.SUPERVISING_PARTNER } },
        { value: config.instructionRef, custom_field: { id: CUSTOM_FIELDS.INSTRUCTION_REF } }
    ];
    
    const payload = {
        data: {
            billable: true,
            client: { id: contactId },
            client_reference: config.instructionRef,
            description: description,
            practice_area: { id: practiceAreaId },
            responsible_attorney: { id: feeEarner.clioId },
            originating_attorney: { id: originating.clioId },
            status: 'Open',
            custom_field_values: customFields
        }
    };
    
    console.log('\n  Creating matter with:');
    console.log('  - Client ID:', contactId);
    console.log('  - Description:', description);
    console.log('  - Practice Area ID:', practiceAreaId);
    console.log('  - Fee Earner:', feeEarner.fullName, `(${feeEarner.clioId})`);
    console.log('  - Originating:', originating.fullName, `(${originating.clioId})`);
    console.log('  - Supervising Partner:', supervisingPartner);
    
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

async function updateInstructionStatus(instructionRef, matterId, displayNumber) {
    console.log('\n  Updating instruction status in database...');
    const connString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    const pool = await sql.connect(connString);
    await pool.request()
        .input('ref', sql.NVarChar, instructionRef)
        .input('matterId', sql.Int, matterId)
        .input('displayNumber', sql.NVarChar, displayNumber)
        .input('status', sql.NVarChar, 'matter_opened')
        .query(`
            UPDATE Instructions 
            SET MatterId = @matterId, 
                MatterDisplayNumber = @displayNumber,
                Status = @status,
                LastModified = GETUTCDATE()
            WHERE InstructionRef = @ref
        `);
    
    await pool.close();
    console.log('  ✓ Instruction status updated');
}

function showHelp() {
    console.log(`
Manual Matter Opening Utility

USAGE:
  node scripts/manual-matter-opening.js <instruction-ref> <fee-earner-initials> [originating-initials]

EXAMPLES:
  node scripts/manual-matter-opening.js HLX-28960-19062 BR
  node scripts/manual-matter-opening.js HLX-28639-58516 RC RC

OPTIONS:
  --practice-area=<id>    Override the practice area ID
  --description="text"    Override the matter description
  --supervising="name"    Override the supervising partner name
  --dry-run              Show what would be done without making changes
  --help                 Show this help message

KNOWN PRACTICE AREAS:
${Object.entries(PRACTICE_AREAS).map(([name, id]) => `  ${name}: ${id}`).join('\n')}
`);
}

async function main() {
    // Parse arguments
    if (process.argv.includes('--help') || process.argv.length < 4) {
        showHelp();
        process.exit(0);
    }
    
    const dryRun = process.argv.includes('--dry-run');
    
    // Parse optional flags
    for (const arg of process.argv) {
        if (arg.startsWith('--practice-area=')) {
            CONFIG.practiceAreaId = parseInt(arg.split('=')[1]);
        }
        if (arg.startsWith('--description=')) {
            CONFIG.description = arg.split('=')[1];
        }
        if (arg.startsWith('--supervising=')) {
            CONFIG.supervisingPartner = arg.split('=')[1];
        }
    }
    
    console.log('='.repeat(60));
    console.log('MANUAL MATTER OPENING UTILITY');
    console.log('='.repeat(60));
    console.log('Instruction Ref:', CONFIG.instructionRef);
    console.log('Fee Earner:', CONFIG.feeEarnerInitials);
    console.log('Originating:', CONFIG.originatingInitials);
    if (dryRun) console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
    
    try {
        // Step 1: Get instruction data
        console.log('\n[1/6] Fetching instruction data...');
        const inst = await fetchInstruction(CONFIG.instructionRef);
        
        // Step 2: Get team member info
        console.log('\n[2/6] Looking up team members...');
        const feeEarner = await getTeamMember(CONFIG.feeEarnerInitials);
        const originating = CONFIG.originatingInitials !== CONFIG.feeEarnerInitials 
            ? await getTeamMember(CONFIG.originatingInitials)
            : feeEarner;
        
        if (dryRun) {
            console.log('\n[DRY RUN] Would proceed to create matter with above details');
            console.log('[DRY RUN] Exiting without making changes');
            process.exit(0);
        }
        
        // Step 3: Get Clio access token
        console.log('\n[3/6] Authenticating with Clio...');
        const accessToken = await getClioAccessToken(CONFIG.feeEarnerInitials);
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        };
        
        // Step 4: Find or create contact
        console.log('\n[4/6] Finding/creating Clio contact...');
        const contactId = await findOrCreateContact(inst, headers);
        
        // Step 5: Create the matter
        console.log('\n[5/6] Creating Clio matter...');
        const matter = await createMatter(contactId, feeEarner, originating, inst, headers, CONFIG);
        
        // Step 6: Update instruction status
        console.log('\n[6/6] Updating instruction status...');
        await updateInstructionStatus(CONFIG.instructionRef, matter.id, matter.display_number);
        
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
