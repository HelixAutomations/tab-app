const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function searchPhone() {
    const credential = new DefaultAzureCredential();
    const secretClient = new SecretClient('https://helix-keys.vault.azure.net/', credential);
    const secret = await secretClient.getSecret('callrail-teamhub');
    const token = secret.value;
    const accountId = '545032576';
    
    const phone = '+447540947439';
    
    // Search with different parameters
    console.log('Searching CallRail for phone:', phone);
    console.log('');
    
    // Try 1: Basic search
    const url1 = `https://api.callrail.com/v3/a/${accountId}/calls.json?search=${encodeURIComponent(phone)}&per_page=100`;
    console.log('1. Basic search:', url1);
    const res1 = await fetch(url1, { headers: { 'Authorization': `Token token="${token}"` } });
    const data1 = await res1.json();
    console.log(`   Found: ${data1.calls?.length || 0} calls`);
    
    // Try 2: Search with date range going back to Nov 2024 (when enquiry came in)
    const url2 = `https://api.callrail.com/v3/a/${accountId}/calls.json?search=${encodeURIComponent(phone)}&start_date=2024-11-01&end_date=2024-11-30&per_page=100`;
    console.log('2. Nov 2024 range:', url2);
    const res2 = await fetch(url2, { headers: { 'Authorization': `Token token="${token}"` } });
    const data2 = await res2.json();
    console.log(`   Found: ${data2.calls?.length || 0} calls`);
    
    // Try 3: Search all of 2024
    const url3 = `https://api.callrail.com/v3/a/${accountId}/calls.json?search=${encodeURIComponent(phone)}&start_date=2024-01-01&end_date=2024-12-31&per_page=100`;
    console.log('3. All 2024:', url3);
    const res3 = await fetch(url3, { headers: { 'Authorization': `Token token="${token}"` } });
    const data3 = await res3.json();
    console.log(`   Found: ${data3.calls?.length || 0} calls`);
    
    // Try 4: Search with UK format phone
    const ukPhone = '07540947439';
    const url4 = `https://api.callrail.com/v3/a/${accountId}/calls.json?search=${encodeURIComponent(ukPhone)}&start_date=2024-01-01&per_page=100`;
    console.log('4. UK format + all time:', url4);
    const res4 = await fetch(url4, { headers: { 'Authorization': `Token token="${token}"` } });
    const data4 = await res4.json();
    console.log(`   Found: ${data4.calls?.length || 0} calls`);
    
    // Try 5: Just the last 10 digits
    const last10 = '7540947439';
    const url5 = `https://api.callrail.com/v3/a/${accountId}/calls.json?search=${encodeURIComponent(last10)}&start_date=2024-01-01&per_page=100`;
    console.log('5. Last 10 digits:', url5);
    const res5 = await fetch(url5, { headers: { 'Authorization': `Token token="${token}"` } });
    const data5 = await res5.json();
    console.log(`   Found: ${data5.calls?.length || 0} calls`);
    
    // If any calls found, show them
    const allCalls = [...(data1.calls || []), ...(data2.calls || []), ...(data3.calls || []), ...(data4.calls || []), ...(data5.calls || [])];
    if (allCalls.length > 0) {
        console.log('\n=== CALLS FOUND ===');
        const uniqueCalls = [...new Map(allCalls.map(c => [c.id, c])).values()];
        uniqueCalls.forEach((call, i) => {
            console.log(`\nCall ${i+1}:`);
            console.log(`  ID: ${call.id}`);
            console.log(`  Date: ${call.start_time}`);
            console.log(`  Customer: ${call.customer_phone_number}`);
            console.log(`  Duration: ${call.duration}s`);
            console.log(`  Source: ${call.source}`);
            console.log(`  Campaign: ${call.campaign}`);
        });
    } else {
        console.log('\n❌ No calls found for this phone number in CallRail');
        console.log('   This enquiry likely came from a web form submission (has GCLID) rather than a phone call.');
    }
}

searchPhone().catch(console.error);
