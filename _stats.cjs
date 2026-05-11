const fs = require('fs');
const lines = fs.readFileSync('server/logs/ops.log.jsonl','utf8').split(/\r?\n/).filter(Boolean);
const evts = lines.map(l=>{ try { return JSON.parse(l);} catch{return null;} }).filter(Boolean);

function stats(arr){
  if(!arr.length) return {n:0,med:null,max:null};
  const s=[...arr].sort((a,b)=>a-b);
  const med = s[Math.floor(s.length/2)];
  return {n:s.length, med, max:s[s.length-1]};
}

const routes = [
  {name:'management-datasets', server:e=>e.type==='http' && /management-datasets/.test(e.action||'') && e.status==='success', client:e=>e.type==='telemetry.Network.request-slow' && /management-datasets/.test(e.data?.path||'')},
  {name:'GET /api/dev/health', server:e=>e.type==='http' && (e.action==='GET /api/dev/health' || e.action==='GET /dev/health') && e.status==='success', client:e=>e.type==='telemetry.Network.request-slow' && /\/(api\/)?dev\/health/.test(e.data?.path||'')},
];

const rows=[];
for(const r of routes){
  const serverEvts = evts.filter(r.server);
  const clientEvts = evts.filter(r.client);
  const srv = stats(serverEvts.map(e=>e.durationMs).filter(x=>typeof x==='number'));
  const cli = stats(clientEvts.map(e=>e.durationMs).filter(x=>typeof x==='number'));
  rows.push({route:r.name, srvMed:srv.med, srvMax:srv.max, srvN:srv.n, cliMed:cli.med?.toFixed(1), cliMax:cli.max?.toFixed(1), cliN:cli.n});
  // last 20 of each
  console.log('---',r.name,'server last 20 durationMs ---');
  console.log(serverEvts.slice(-20).map(e=>e.durationMs).join(', '));
  console.log('---',r.name,'client last 20 durationMs ---');
  console.log(clientEvts.slice(-20).map(e=>Math.round(e.durationMs)).join(', '));
}
console.log('\nSUMMARY');
console.table(rows);
