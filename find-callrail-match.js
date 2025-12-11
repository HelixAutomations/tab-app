const fetch = require('node-fetch');

// Phone numbers from recent CallRail calls (today Dec 2, 2025)
const phones = [
  '+447768067463',
  '+447867426439', 
  '+447727017068',
  '+447415158854',
  '+447414223381',
  '+447939921590',
  '+447939638555',
  '+447447976518'
];

async function findMatches() {
  console.log('Searching for enquiries matching recent CallRail phone numbers...\n');
  console.log('Phone numbers from CallRail (today):', phones.join(', '), '\n');
  
  for (const phone of phones) {
    // Clean phone for search
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    
    try {
      // Search via the running server
      const resp = await fetch(`http://localhost:3001/api/enquiries/search?phone=${encodeURIComponent(cleanPhone)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.enquiries && data.enquiries.length > 0) {
          console.log(`✓ MATCH for ${phone}:`);
          data.enquiries.slice(0, 2).forEach(e => {
            console.log(`  - Email: ${e.email}`);
            console.log(`    Name: ${e.first_name} ${e.last_name}`);
            console.log(`    Source: ${e.source || '—'}`);
          });
          console.log('');
        }
      }
    } catch (err) {
      // Server might not be running, skip
    }
  }
  
  console.log('---');
  console.log('To find a matching matter, search for matters with clients who have one of these phone numbers.');
  console.log('Try searching in the Matters Report for a client phone ending in:', phones.map(p => p.slice(-4)).join(', '));
}

findMatches();
