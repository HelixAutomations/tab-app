const displayEnquiries = [
  {"ID": "28609", "Email": "prospects@helix-law.com", "First_Name": "Andy", "Last_Name": "Gelder", "Touchpoint_Date": "2025-11-20", "Area_of_Work": "property"},
  {"ID": "28609", "Email": "prospects@helix-law.com", "First_Name": "Keith", "Last_Name": "Graham", "Touchpoint_Date": "2025-11-17", "Area_of_Work": "property"},
  {"ID": "28609", "Email": "prospects@helix-law.com", "First_Name": "Linda", "Last_Name": "Rogers", "Touchpoint_Date": "2025-11-15", "Area_of_Work": "other / unsure"},
  {"ID": "23849", "Email": "prospects@helix-law.com", "First_Name": "Indie", "Last_Name": "Mckeon", "Touchpoint_Date": "2025-08-21", "Area_of_Work": "other / unsure"},
  {"ID": "23849", "Email": "prospects@helix-law.com", "First_Name": "Malcolm", "Last_Name": "Wills", "Touchpoint_Date": "2025-08-21", "Area_of_Work": "property"},
  {"ID": "26069", "Email": "eduard@example.com", "First_Name": "Eduard", "Last_Name": "Vermaat", "Touchpoint_Date": "2025-05-19", "Area_of_Work": "unsure"}
];

const showMineOnly = false; // Simulating "All" view or "Claimable"
const activeState = 'Claimable'; // Simulating Claimable view

// --- Logic from Enquiries.tsx ---

const normEmail = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const normPhone = (s) => (typeof s === 'string' ? s.replace(/\D/g, '').slice(-7) : '');

const parseDate = (val) => {
  if (!val || typeof val !== 'string') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const createdAt = (e) => {
  return (
    parseDate(e.Touchpoint_Date) ||
    parseDate(e.datetime) ||
    parseDate(e.claim) ||
    new Date(0)
  );
};

const dayKey = (d) => {
  if (!d || isNaN(d.getTime())) return 'invalid';
  return d.toISOString().split('T')[0];
};

const fuzzyKey = (e) => {
  const d = createdAt(e);
  const day = dayKey(d);
  const email = normEmail(e.Email || e.email);
  const phone = normPhone(e.Phone_Number || e.phone);
  const aow = (e.Area_of_Work || e.aow || '').toString().toLowerCase();
  const name = [e.First_Name || e.first || '', e.Last_Name || e.last || '']
    .map((x) => (x || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  
  // For team emails (prospects@helix-law.com), use name as primary identifier
  const isTeamEmail = email.includes('prospects@') || email.includes('team@');
  
  // Strong signal: if personal email (non-team) or phone present, group per day
  if (!isTeamEmail && (email || phone)) {
    const contact = email || phone;
    return showMineOnly ? `${contact}|${day}` : `${contact}|${day}`;
  }
  
  // For team emails or name-only: include name+AOW to keep different people separate
  // If name is missing but it's a team email, use ID to separate (if available)
  if (isTeamEmail) {
    if (!name && (e.ID || e.id)) {
      return `id:${e.ID || e.id}`;
    }
    // If name is present, use name + ID to ensure uniqueness even if names are similar
    // This is critical for prospects@ where multiple people might share ID but have different names
    // Or different people share ID and email
    return `${name}|${e.ID || e.id}|${day}`;
  }

  const contact = name || email || 'unknown';
  return `${contact}|${aow}|${day}`;
};

const sameIdentity = (a, b) => {
  // Check email match (but skip team emails like prospects@helix-law.com)
  const aEmail = normEmail(a.Email || a.email);
  const bEmail = normEmail(b.Email || b.email);
  const aIsTeamEmail = aEmail.includes('prospects@') || aEmail.includes('team@');
  const bIsTeamEmail = bEmail.includes('prospects@') || bEmail.includes('team@');
  
  if (aEmail && bEmail && !aIsTeamEmail && !bIsTeamEmail) {
    return aEmail === bEmail;
  }
  
  // Check phone match
  const aPhone = normPhone(a.Phone_Number || a.phone);
  const bPhone = normPhone(b.Phone_Number || b.phone);
  if (aPhone && bPhone) return aPhone === bPhone;
  
  // Check name match - if names differ significantly, they're different people
  const aName = `${(a.First_Name || a.first || '')} ${(a.Last_Name || a.last || '')}`.trim().toLowerCase();
  const bName = `${(b.First_Name || b.first || '')} ${(b.Last_Name || b.last || '')}`.trim().toLowerCase();
  if (aName && bName && aName !== bName) {
    return false; // Different names = different people
  }
  
  // If neither email (or only team emails), phone, nor names can confirm identity, don't merge
  return false;
};

// Simulation of the dedupe loop
const map = new Map();

console.log('--- Processing Enquiries ---');
displayEnquiries.forEach(e => {
  const baseKey = fuzzyKey(e);
  console.log(`Enquiry: ${e.First_Name} ${e.Last_Name} (${e.ID}) -> Key: ${baseKey}`);
  
  const existing = map.get(baseKey);
  
  if (!existing) {
    map.set(baseKey, e);
    console.log('  -> Added new');
  } else {
    const existingId = String(existing.ID || existing.id || '');
    const eId = String(e.ID || e.id || '');
    const idsDiffer = existingId && eId && existingId !== eId;
    
    if (idsDiffer) {
      const identityMatch = sameIdentity(existing, e);
      if (!identityMatch) {
         console.log('  -> Collision! Different identity (IDs differ). Creating unique key.');
         let uniqueSuffix = 0;
         let newKey = `${baseKey}_${uniqueSuffix}`;
         while (map.has(newKey)) {
            uniqueSuffix++;
            newKey = `${baseKey}_${uniqueSuffix}`;
         }
         map.set(newKey, e);
      } else {
        console.log('  -> Merged (Identity Match)');
      }
    } else {
        // IDs match. Check if they are actually different people (e.g. shared ID for prospects@)
        const identityMatch = sameIdentity(existing, e);
        if (!identityMatch) {
          console.log('  -> Collision! Same ID but different identity. Creating unique key.');
          let uniqueSuffix = 0;
          let newKey = `${baseKey}_${uniqueSuffix}`;
          while (map.has(newKey)) {
             uniqueSuffix++;
             newKey = `${baseKey}_${uniqueSuffix}`;
          }
          map.set(newKey, e);
        } else {
          console.log('  -> Merged (Same ID & Identity)');
        }
    }
  }
});

console.log('\n--- Resulting Map Keys ---');
console.log(Array.from(map.keys()));
console.log(`Total items: ${map.size}`);
