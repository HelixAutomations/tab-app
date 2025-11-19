/**
 * One-off script to manually open the matter HLX-22002389-72462 (Company)
 * Uses existing server route /api/clio-matters and maps company details from Instructions DB.
 */
require('dotenv').config();
const fetch = require('node-fetch');

const instructionRef = 'HLX-22002389-72462';
const baseUrl = process.env.PUBLIC_BASE_URL || 'https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net';

async function fetchInstruction() {
  const url = `${baseUrl}/api/instructions?instructionRef=${encodeURIComponent(instructionRef)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch instruction: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.instruction || null;
}

function buildCompanyClient(inst) {
  // Prefer company fields, fallback to generic address fields if necessary
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
    console.log('Fetching instruction details...');
    const inst = await fetchInstruction();
    if (!inst) throw new Error('Instruction not found in DB');

    const client = buildCompanyClient(inst);
    const description = 'True value claim against Cubix Contractors Limited';

    // Practice area must match server/utils/clioConstants.js
    const practiceArea = 'Construction Contract Advice';

    const payload = {
      formData: {
        matter_details: {
          instruction_ref: instructionRef,
          description,
          client_type: 'Company',
          practice_area: practiceArea,
          folder_structure: 'Default',
          date_created: new Date().toISOString().slice(0, 10)
        },
        team_assignments: {
          supervising_partner: 'Jonathan',
          fee_earner: 'Christopher Smith',
          fee_earner_initials: 'CS',
          originating_solicitor: 'Christopher Smith',
          originating_solicitor_initials: 'CS'
        },
        client_information: [ client ]
      },
      // Tokens and Clio IDs resolve from initials
      initials: 'cs'
    };

    const url = `${baseUrl}/api/clio-matters`;
    console.log('=== Creating matter for Company client ===');
    console.log('Instruction Ref:', instructionRef);
    console.log('Practice Area:', practiceArea);
    console.log('URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log('--- RESPONSE ---');
    console.log('Status:', response.status, response.statusText);
    try {
      const data = JSON.parse(text);
      if (response.ok && data.ok && data.matter) {
        console.log('\n🎉 SUCCESS! Matter opened:');
        console.log('📋 Matter ID:', data.matter.id);
        console.log('📋 Display Number:', data.matter.display_number);
        console.log('📋 Client Reference:', data.matter.client_reference);
      } else {
        console.log('\n❌ Failed to create matter');
        console.log('Response:', JSON.stringify(data, null, 2));
        if (data.error) console.log('Error details:', data.error);
      }
    } catch (e) {
      console.log('Could not parse JSON response:');
      console.log('Raw Response:', text);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

openMatter();
