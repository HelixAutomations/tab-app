/**
 * One-off script to manually open the matter HLX-28960-19062 (Individual - Commercial)
 * Issue: Failed due to "Bankruptcy Petition Advice" practice area not mapped in clioConstants.js
 * 
 * User: BR (Brendan Rimmer)
 * Practice Area: Bankruptcy Petition Advice
 * Description: Case no.108 of 2025 - Bankruptcy Petition of HL Partnership Limited
 * 
 * Run: node open-matter-oneoff-28960.js
 */
require('dotenv').config();
const fetch = require('node-fetch');

const instructionRef = 'HLX-28960-19062';
const baseUrl = process.env.PUBLIC_BASE_URL || 'https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net';

async function fetchInstruction() {
  const url = `${baseUrl}/api/instructions?instructionRef=${encodeURIComponent(instructionRef)}`;
  console.log('Fetching instruction from:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch instruction: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.instruction || null;
}

function buildIndividualClient(inst) {
  // Extract individual client details from instruction
  const addr = {
    house_number: inst.HouseNumber || '',
    street: inst.Street || '',
    city: inst.City || '',
    county: inst.County || '',
    post_code: inst.Postcode || inst.PostCode || '',
    country: inst.Country || 'UK'
  };

  return {
    first_name: inst.FirstName || inst.First || '',
    last_name: inst.LastName || inst.Last || '',
    email: inst.Email || '',
    phone: inst.Phone || inst.BestNumber || '',
    address: addr,
    date_of_birth: inst.DateOfBirth || null,
    verification: {
      check_id: inst.EIDCheckId || inst.CheckId || null,
      check_result: inst.EIDResult || inst.CheckResult || null,
      check_expiry: inst.CheckExpiry || null
    }
  };
}

async function openMatter() {
  try {
    console.log('='.repeat(60));
    console.log('ONE-OFF MATTER OPENING: HLX-28960-19062');
    console.log('='.repeat(60));
    
    console.log('\nFetching instruction details...');
    const inst = await fetchInstruction();
    if (!inst) throw new Error('Instruction not found in DB');
    
    console.log('✓ Instruction found');
    console.log('  Name:', inst.FirstName, inst.LastName);
    console.log('  Email:', inst.Email);
    console.log('  Client Type:', inst.ClientType || 'Individual');

    const client = buildIndividualClient(inst);
    
    // Original form data from the failed submission
    const description = 'Case no.108 of 2025 - Bankruptcy Petition of HL Partnership Limited';
    // Use Winding Up Petition Advice as a close alternative since Bankruptcy Petition Advice is not mapped
    // OR we can add the mapping first to clioConstants.js
    const practiceArea = 'Bankruptcy Petition Advice';
    const areaOfWork = 'Commercial';
    const folderStructure = 'Default';

    const payload = {
      formData: {
        matter_details: {
          instruction_ref: instructionRef,
          description,
          client_type: 'Individual',
          area_of_work: areaOfWork,
          practice_area: practiceArea,
          folder_structure: folderStructure,
          date_created: new Date().toISOString().slice(0, 10)
        },
        team_assignments: {
          supervising_partner: 'Brendan',
          fee_earner: 'Brendan Rimmer',
          fee_earner_initials: 'BR',
          originating_solicitor: 'Brendan Rimmer',
          originating_solicitor_initials: 'BR'
        },
        client_information: [client],
        source_details: {
          source: null,
          referrer_name: null
        }
      },
      initials: 'br'  // Brendan Rimmer's initials for Clio token lookup
    };

    const url = `${baseUrl}/api/clio-matters`;
    console.log('\n--- REQUEST ---');
    console.log('URL:', url);
    console.log('Instruction Ref:', instructionRef);
    console.log('Client Type:', 'Individual');
    console.log('Area of Work:', areaOfWork);
    console.log('Practice Area:', practiceArea);
    console.log('Description:', description);
    console.log('Fee Earner:', 'Brendan Rimmer (BR)');
    console.log('Supervising Partner:', 'Brendan');

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
