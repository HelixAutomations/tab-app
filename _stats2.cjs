const fs = require('fs');
const lines = fs.readFileSync('server/logs/ops.log.jsonl','utf8').split(/\r?\n/).filter(Boolean);
const evts = lines.map(l=>{ try{return JSON.parse(l);}catch{return null;} }).filter(Boolean);
const acts = new Set();
for(const e of evts){ if(e.type==='http' && /health/i.test(e.action||'')) acts.add(e.action+' :: '+e.status); }
console.log([...acts].join('\n'));
console.log('---');
// Check any http events with non-success/started status
const finished = evts.filter(e=>e.type==='http' && /dev\/health/.test(e.action||'') && e.status!=='started');
console.log('finished count:', finished.length);
console.log(finished.slice(-5).map(e=>JSON.stringify(e)).join('\n'));
