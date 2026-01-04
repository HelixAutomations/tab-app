import fetch from 'node-fetch';

// Test a few enquiry emails to see what enrichment data is returned
const testEmails = [
  'sahelnazari05@gmail.com',      // Sahel Nazari (shows HLX-29240-44932)
  'w.f.coleman@btinternet.com',   // Wayne Coleman (shows COLEM10893-00001 ✓)
  'unasap@msn.com',               // Una Saplamides (shows HLX-28517-96019)
  'debismith1971@outlook.com'     // Deborah Smith (shows SMITH10849-00001 ✓)
];

const API_URL = 'http://localhost:53000/api/enquiry-enrichment';

async function testEnrichment() {
  const emailsParam = testEmails.join(',');
  const url = `${API_URL}?enquiryEmails=${encodeURIComponent(emailsParam)}`;
  
  console.log(`\nFetching enrichment data for ${testEmails.length} emails...\n`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Display results for each email
    testEmails.forEach(email => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`EMAIL: ${email}`);
      console.log(`${'='.repeat(80)}`);
      
      const enrichmentData = data[email];
      if (!enrichmentData) {
        console.log('❌ No enrichment data found');
        return;
      }
      
      if (enrichmentData.pitchData) {
        const pitch = enrichmentData.pitchData;
        console.log('\n📊 PITCH DATA:');
        console.log(`   Deal ID: ${pitch.dealId}`);
        console.log(`   Status: ${pitch.status}`);
        console.log(`   InstructionRef: ${pitch.instructionRef || '(none)'}`);
        console.log(`   DisplayNumber: ${pitch.displayNumber || '(none)'}`);
        console.log(`   Area of Work: ${pitch.areaOfWork}`);
        console.log(`   Service: ${pitch.serviceDescription}`);
      } else {
        console.log('\n📊 PITCH DATA: (none)');
      }
      
      if (enrichmentData.teamsData) {
        console.log('\n💬 TEAMS DATA: Yes');
      } else {
        console.log('\n💬 TEAMS DATA: No');
      }
    });
    
    console.log(`\n${'='.repeat(80)}\n`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Make sure the development server is running on http://localhost:53000');
  }
}

testEnrichment();
