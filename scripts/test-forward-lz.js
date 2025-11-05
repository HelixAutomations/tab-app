/*
 Simple test to exercise /api/searchInbox and /api/forwardEmail for lz@helix-law.com
 Usage: node scripts/test-forward-lz.js
 Optionally set TEST_BASE (e.g., http://localhost:8080)
*/
const fetch = require('node-fetch');

const BASE = process.env.TEST_BASE || 'http://localhost:8080';
const USER = 'lz@helix-law.com';

async function main() {
  try {
    console.log(`[test] Searching inbox for ${USER}...`);
    const searchRes = await fetch(`${BASE}/api/searchInbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeEarnerEmail: USER, prospectEmail: USER, maxResults: 5 }),
    });
    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      console.error('[test] searchInbox failed', searchRes.status, searchText.slice(0, 500));
      process.exit(1);
    }
    const searchJson = JSON.parse(searchText);
    const emails = Array.isArray(searchJson.emails) ? searchJson.emails : [];
    if (emails.length === 0) {
      console.error('[test] No messages found in Inbox');
      process.exit(2);
    }
    const msg = emails[0];
    console.log(`[test] Chosen message:`, { id: msg.id, subject: msg.subject, from: msg.from, receivedDateTime: msg.receivedDateTime });

    console.log(`[test] Attempting TRUE forward via /api/forwardEmail...`);
    const forwardRes = await fetch(`${BASE}/api/forwardEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: USER,
        subject: msg.subject || 'Test forward',
        mailboxEmail: USER,
        messageId: msg.id,
        debug: true,
      }),
    });
    const forwardText = await forwardRes.text();
    let payload;
    try { payload = JSON.parse(forwardText); } catch { payload = { raw: forwardText }; }
    console.log('[test] Forward response:', forwardRes.status, payload);
    if (!forwardRes.ok && forwardRes.status !== 207) {
      process.exit(3);
    }
  } catch (err) {
    console.error('[test] Unexpected error', err);
    process.exit(99);
  }
}

main();
