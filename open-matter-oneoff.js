/**
 * One-off script to manually open the failed matter HLX-28639-58516
 * Using minimal payload since contact already exists
 */
require('dotenv').config();
const fetch = require('node-fetch');

const instructionRef = 'HLX-28639-58516';
const baseUrl = 'https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net';

async function fetchInstruction() {
  const url = `${baseUrl}/api/instructions?instructionRef=${encodeURIComponent(instructionRef)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch instruction: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.instruction || null;
}

async function openMatterWithRealClient() {
  try {
    console.log('Fetching real instruction details...');
    const inst = await fetchInstruction();
    if (!inst) throw new Error('Instruction not found in DB');

    const first = inst.FirstName || inst.first_name || inst.first || '';
    const last = inst.LastName || inst.last_name || inst.last || '';
    const email = inst.Email || inst.email || '';
    const phone = inst.Phone || inst.phone || '';

    if (!email && !(first && last)) {
      console.warn('Missing email and name in instruction; proceeding may create placeholder contact.');
    }

    const payload = {
      formData: {
        matter_details: {
          instruction_ref: instructionRef,
          description: 'Advice on Employment Dispute',
          client_type: 'Individual',
          practice_area: 'Post Termination Dispute',
          folder_structure: 'Employment',
          dispute_value: 'Less than £10k',
          date_created: '2025-11-17'
        },
        team_assignments: {
          supervising_partner: 'Alex',
          originating_solicitor: 'Richard Chapman',
          originating_solicitor_initials: 'RC',
          fee_earner: 'Richard Chapman',
          fee_earner_initials: 'RC'
        },
        client_information: [
          {
            first_name: first,
            last_name: last,
            email: email,
            phone: phone
          }
        ]
      },
      initials: 'rc'
    };

    const url = `${baseUrl}/api/clio-matters`;
    console.log('=== Creating matter for REAL client ===');
    console.log('Instruction Ref:', instructionRef);
    console.log('URL:', url);
    console.log('Client:', { first, last, email });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const responseText = await response.text();
    
    console.log('--- RESPONSE ---');
    console.log('Status:', response.status, response.statusText);
    
    try {
      const responseJson = JSON.parse(responseText);
      
      if (response.ok && responseJson.ok && responseJson.matter) {
        console.log('\n🎉 SUCCESS! Matter opened for real client:');
        console.log('📋 Matter ID:', responseJson.matter.id);
        console.log('📋 Display Number:', responseJson.matter.display_number);
        console.log('📋 Instruction Ref:', instructionRef);
        console.log('\n✅ RC can now proceed with the case');
        console.log('✅ The matter opening workflow is fixed');
      } else {
        console.log('\n❌ Failed to create matter');
        console.log('Response:', JSON.stringify(responseJson, null, 2));
        if (responseJson.error) {
          console.log('Error details:', responseJson.error);
        }
      }
    } catch (e) {
      console.log('Could not parse JSON response:');
      console.log('Raw Response:', responseText);
    }
    
  } catch (error) {
    console.error('❌ Network Error:', error.message);
  }
}

openMatterWithRealClient();