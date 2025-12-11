/**
 * One-off script to manually open the matter HLX-28437-84234 (Individual - Construction)
 * Issue: Automated flow failed at "Clio Matter Opened"; forcing creation manually.
 *
 * User: CS (Christopher Smith)
 * Practice Area: Contract Dispute
 * Area of Work: Construction
 * Description: Review, advice and letter of claim
 *
 * Run: node open-matter-oneoff-28437.js
 */
require('dotenv').config();
const fetch = require('node-fetch');

const instructionRef = 'HLX-28437-84234';
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
  const addr = {
    house_number: inst.HouseNumber || inst.house_number || '',
    street: inst.Street || inst.street || '',
    city: inst.City || inst.city || '',
    county: inst.County || inst.county || '',
    post_code: inst.Postcode || inst.PostCode || inst.post_code || '',
    country: inst.Country || inst.country || 'UK'
  };

  return {
    first_name: inst.FirstName || inst.first_name || inst.First || inst.first || '',
    last_name: inst.LastName || inst.last_name || inst.Last || inst.last || '',
    email: inst.Email || inst.email || '',
    phone: inst.Phone || inst.phone || inst.BestNumber || inst.best_number || '',
    address: addr,
    date_of_birth: inst.DateOfBirth || inst.date_of_birth || null,
    verification: {
      check_id: inst.EIDCheckId || inst.check_id || inst.CheckId || null,
      check_result: inst.EIDResult || inst.check_result || inst.CheckResult || null,
      check_expiry: inst.CheckExpiry || inst.check_expiry || null
    }
  };
}

async function openMatter() {
  try {
    console.log('='.repeat(60));
    console.log('ONE-OFF MATTER OPENING: HLX-28437-84234');
    console.log('='.repeat(60));

    console.log('\nFetching instruction details...');
    const inst = await fetchInstruction();
    if (!inst) throw new Error('Instruction not found in DB');

    console.log('✓ Instruction found');
    console.log('  Name:', inst.FirstName || inst.first_name, inst.LastName || inst.last_name);
    console.log('  Email:', inst.Email || inst.email);
    console.log('  Client Type:', inst.ClientType || 'Individual');

    const client = buildIndividualClient(inst);

    // Form data based on user request
    const description = 'Review, advice and letter of claim';
    const practiceArea = 'Contract Dispute';
    const areaOfWork = 'Construction';
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
          supervising_partner: 'Alex',
          fee_earner: 'Christopher Smith',
          fee_earner_initials: 'CS',
          originating_solicitor: 'Christopher Smith',
          originating_solicitor_initials: 'CS'
        },
        client_information: [client],
        source_details: {
          source: null,
          referrer_name: null
        }
      },
      initials: 'cs'
    };

    const url = `${baseUrl}/api/clio-matters`;
    console.log('\n--- REQUEST ---');
    console.log('URL:', url);
    console.log('Instruction Ref:', instructionRef);
    console.log('Client Type:', 'Individual');
    console.log('Area of Work:', areaOfWork);
    console.log('Practice Area:', practiceArea);
    console.log('Description:', description);
    console.log('Fee Earner:', 'Christopher Smith (CS)');
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
