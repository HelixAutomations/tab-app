const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function test() {
    const credential = new DefaultAzureCredential();
    const secretClient = new SecretClient('https://helix-keys.vault.azure.net/', credential);
    const secret = await secretClient.getSecret('callrail-teamhub');
    const token = secret.value;
    const accountId = '545032576';
    
    // Get recent calls without phone filter - get more to find meaningful ones
    const url = `https://api.callrail.com/v3/a/${accountId}/calls.json?per_page=50&fields=id,start_time,duration,direction,answered,customer_phone_number,customer_name,source,medium,campaign,keywords,landing_page_url,tracking_phone_number,business_phone_number`;
    console.log('Fetching recent CallRail calls (filtering for answered, >60s)...\n');
    
    const res = await fetch(url, {
        headers: { 'Authorization': `Token token="${token}"` }
    });
    const data = await res.json();
    
    if (data.calls && data.calls.length > 0) {
        // Filter for meaningful calls
        const meaningful = data.calls.filter(c => c.answered && c.duration > 60);
        
        console.log(`Total calls: ${data.calls.length}, Meaningful (answered, >60s): ${meaningful.length}\n`);
        
        meaningful.slice(0, 10).forEach((call, i) => {
            console.log(`═══════════════════════════════════════════════════════`);
            console.log(`CALL ${i+1}: ${call.customer_phone_number}`);
            console.log(`═══════════════════════════════════════════════════════`);
            console.log(`  id:            ${call.id}`);
            console.log(`  start_time:    ${call.start_time}`);
            console.log(`  duration:      ${call.duration}s (${Math.floor(call.duration/60)}m ${call.duration%60}s)`);
            console.log(`  direction:     ${call.direction}`);
            console.log(`  answered:      ${call.answered}`);
            console.log(`  customer_name: ${call.customer_name || '—'}`);
            console.log(`  source:        ${call.source || '—'}`);
            console.log(`  medium:        ${call.medium || '—'}`);
            console.log(`  campaign:      ${call.campaign || '—'}`);
            console.log(`  keywords:      ${call.keywords || '—'}`);
            console.log(`  landing_page:  ${call.landing_page_url || '—'}`);
            console.log(`  tracking_num:  ${call.tracking_phone_number || '—'}`);
            console.log(`  business_num:  ${call.business_phone_number || '—'}`);
            console.log('');
        });
        
        // Output phone numbers for easy search
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('PHONE NUMBERS TO SEARCH IN MATTERS REPORT:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const uniquePhones = [...new Set(meaningful.map(c => c.customer_phone_number).filter(Boolean))];
        uniquePhones.forEach(p => {
            const cleanPhone = p.replace(/\D/g, '').slice(-10);
            console.log(`  ${p}  →  search last 4 digits: ${cleanPhone.slice(-4)}`);
        });
    } else {
        console.log('No calls returned');
        console.log('Response:', JSON.stringify(data, null, 2));
    }
}
test().catch(console.error);
