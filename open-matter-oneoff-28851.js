/**
 * One-off script to manually open the matter HLX-28851-39959 (Company - Property)
 * Issue: Original attempt failed due to "Miscellaneous" practice area not mapped in clioConstants.js
 * Fix: Added "Miscellaneous" mapping to clioConstants.js
 * 
 * User: SP (Sam Packwood)
 * Practice Area: Miscellaneous (Property)
 * Description: Advice on Covenants
 */
require('dotenv').config();
const fetch = require('node-fetch');

const instructionRef = 'HLX-28851-39959';
const baseUrl = process.env.PUBLIC_BASE_URL || 'https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net';

async function fetchInstruction() {
  const url = `${baseUrl}/api/instructions?instructionRef=${encodeURIComponent(instructionRef)}`;
  console.log('Fetching instruction from:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch instruction: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.instruction || null;
}

function buildCompanyClient(inst) {
  const companyName = inst.CompanyName || inst.Company || null;
  const addr = {
    house_number: inst.CompanyHouseNumber || inst.HouseNumber || '',
    street: inst.CompanyStreet || inst.Street || '',
    city: inst.CompanyCity || inst.City || '',
    county: inst.CompanyCounty || inst.County || '',
    post_code: inst.CompanyPostcode || inst.Postcode || '',
    country: inst.CompanyCountry || inst.Country || ''
  };

  return {
    first_name: inst.FirstName || inst.First || '',
    last_name: inst.LastName || inst.Last || '',
    email: inst.Email || '',
    phone: inst.Phone || '',
    company_details: {
      name: companyName,
      number: inst.CompanyNumber || null,
      address: addr
    }
  };
}

async function openMatter() {
  try {
    console.log('='.repeat(60));
    console.log('ONE-OFF MATTER OPENING: HLX-28851-39959');
    console.log('='.repeat(60));
    
    console.log('\nFetching instruction details...');
    const inst = await fetchInstruction();
    if (!inst) throw new Error('Instruction not found in DB');
    
    console.log('✓ Instruction found');
    console.log('  Company:', inst.CompanyName || inst.Company || '(none)');
    console.log('  Contact:', inst.FirstName, inst.LastName);
    console.log('  Email:', inst.Email);

    const client = buildCompanyClient(inst);
    
    // Original form data from the failed submission
    const description = 'Advice on Covenants';
    const practiceArea = 'Miscellaneous';  // Now mapped in clioConstants.js
    const areaOfWork = 'Property';
    const folderStructure = 'Default';

    const payload = {
      formData: {
        matter_details: {
          instruction_ref: instructionRef,
          description,
          client_type: 'Company',
          area_of_work: areaOfWork,
          practice_area: practiceArea,
          folder_structure: folderStructure,
          date_created: new Date().toISOString().slice(0, 10)
        },
        team_assignments: {
          supervising_partner: 'Alex',
          fee_earner: 'Sam Packwood',
          fee_earner_initials: 'SP',
          originating_solicitor: 'Sam Packwood',
          originating_solicitor_initials: 'SP'
        },
        client_information: [client],
        source_details: {
          source: null,
          referrer_name: null
        }
      },
      initials: 'sp'  // Sam Packwood's initials for Clio token lookup
    };

    const url = `${baseUrl}/api/clio-matters`;
    console.log('\n--- REQUEST ---');
    console.log('URL:', url);
    console.log('Instruction Ref:', instructionRef);
    console.log('Client Type:', 'Company');
    console.log('Area of Work:', areaOfWork);
    console.log('Practice Area:', practiceArea);
    console.log('Description:', description);
    console.log('Fee Earner:', 'Sam Packwood (SP)');
    console.log('Supervising Partner:', 'Alex');

    console.log('\nSending request...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log('\n--- RESPONSE ---');
    console.log('Status:', response.status, response.statusText);
    
    try {
      const data = JSON.parse(text);
      if (response.ok && data.ok && data.matter) {
        console.log('\n' + '='.repeat(60));
        console.log('🎉 SUCCESS! Matter opened');
        console.log('='.repeat(60));
        console.log('📋 Matter ID:', data.matter.id);
        console.log('📋 Display Number:', data.matter.display_number);
        console.log('📋 Client Reference:', data.matter.client_reference);
        console.log('📋 Description:', data.matter.description);
        console.log('📋 Status:', data.matter.status);
        console.log('\n✓ Matter successfully created in Clio');
      } else {
        console.log('\n❌ Failed to create matter');
        console.log('Response:', JSON.stringify(data, null, 2));
        if (data.error) {
          console.log('\nError details:', data.error);
        }
      }
    } catch (e) {
      console.log('Could not parse JSON response:');
      console.log('Raw Response:', text);
    }
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
  }
}

openMatter();
