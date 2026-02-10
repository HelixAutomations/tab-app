import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Connection, Request as SqlRequest, TYPES } from "tedious";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import axios from "axios";

interface InsertNotableCaseInfoRequest {
  initials: string;
  context_type: 'C' | 'P';
  display_number: string | null;
  prospect_id: string | null;
  merit_press: string | null;
  summary: string;
  value_in_dispute?: string | null;
  value_in_dispute_exact?: string | null;
  c_reference_status: boolean;
  counsel_instructed: boolean;
  counsel_name?: string | null;
}

interface Matter { display_number: string; client_name: string; matter_description: string; fee_earner: string; }
interface NotableCaseEntry { id: string; initials: string; display_number: string; summary: string; value_in_dispute?: string; c_reference_status: boolean; counsel_instructed: boolean; counsel_name?: string; created_at: Date; }
interface InsertResult { success: boolean; message: string; insertedId?: string; }

async function getRequestBody(req: HttpRequest): Promise<InsertNotableCaseInfoRequest> {
  if (req.body && typeof req.body === 'object' && !(req.body as any).getReader) return req.body as any;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  if (req.body && typeof (req.body as any).getReader === 'function') {
    const reader = (req.body as any).getReader(); let chunks = '';
    while (true) { const { value, done } = await reader.read(); if (done) break; chunks += typeof value === 'string' ? value : new TextDecoder().decode(value); }
    return JSON.parse(chunks);
  }
  throw new Error('Empty body');
}

function parseConnectionString(connectionString: string) {
  const parts = connectionString.split(';').filter(Boolean);
  const config: any = { server: '', options: { encrypt: true } };
  for (const part of parts) {
    const [k, ...rest] = part.split('='); const key = k.trim(); const value = rest.join('=').trim();
    switch (key) {
      case 'Server': config.server = value; break;
      case 'Database': config.options.database = value; break;
      case 'User ID': config.authentication = config.authentication || { type: 'default', options: { userName: '', password: '' } }; config.authentication.options.userName = value; break;
      case 'Password': config.authentication = config.authentication || { type: 'default', options: { userName: '', password: '' } }; config.authentication.options.password = value; break;
      case 'Encrypt': config.options.encrypt = value.toLowerCase() === 'true'; break;
      case 'TrustServerCertificate': config.options.trustServerCertificate = value.toLowerCase() === 'true'; break;
    }
  }
  return config;
}

/**
 * Lookup additional matters with the same display number
 */
async function lookupRelatedMatters(displayNumber: string, config: any): Promise<Matter[]> {
  return new Promise<Matter[]>((resolve, reject) => {
    const connection = new Connection(config); const matters: Matter[] = [];
    connection.on('connect', err => {
      if (err) { reject(err); return; }
      const q = 'SELECT display_number, initials as client_name, summary as matter_description, initials as fee_earner FROM dbo.notable_case_info WHERE display_number = @DisplayNumber ORDER BY created_at DESC;';
      const r = new SqlRequest(q, e => { if (e) { reject(e); connection.close(); } });
      r.addParameter('DisplayNumber', TYPES.NVarChar, displayNumber);
      r.on('row', c => matters.push({ display_number: c[0].value, client_name: c[1].value, matter_description: c[2].value, fee_earner: c[3].value }));
      r.on('requestCompleted', () => { connection.close(); resolve(matters); });
      connection.execSql(r);
    });
    connection.on('error', e => reject(e));
    connection.connect();
  });
}

/**
 * Insert notable case info into the database
 */
async function insertNotableCaseInfo(data: InsertNotableCaseInfoRequest, config: any): Promise<InsertResult> {
  return new Promise<InsertResult>((resolve, reject) => {
    const connection = new Connection(config);
    connection.on('connect', err => {
      if (err) { reject(err); return; }
  const q = `INSERT INTO dbo.notable_case_info (initials, context_type, display_number, prospect_id, summary, merit_press, value_in_dispute, value_in_dispute_exact, c_reference_status, counsel_instructed, counsel_name)
         OUTPUT Inserted.id
         VALUES (@Initials,@ContextType,@DisplayNumber,@ProspectId,@Summary,@MeritPress,@ValueInDispute,@ValueInDisputeExact,@CRef,@CounselInstr,@CounselName);`;
  const r = new SqlRequest(q, e => { if (e) { reject(e); connection.close(); } });
      r.addParameter('Initials', TYPES.NVarChar, data.initials);
      r.addParameter('ContextType', TYPES.Char, data.context_type);
      r.addParameter('DisplayNumber', TYPES.NVarChar, data.display_number);
      r.addParameter('ProspectId', TYPES.NVarChar, data.prospect_id);
      r.addParameter('Summary', TYPES.Text, data.summary);
      r.addParameter('MeritPress', TYPES.Text, data.merit_press || null);
      r.addParameter('ValueInDispute', TYPES.NVarChar, data.value_in_dispute || null);
      const exactRaw = data.value_in_dispute_exact ? data.value_in_dispute_exact.replace(/[,£\s]/g, '') : null;
      const exactVal = exactRaw && !isNaN(Number(exactRaw)) ? Number(exactRaw) : null;
      r.addParameter('ValueInDisputeExact', TYPES.Decimal, exactVal, { precision: 19, scale: 2 });
  // Ensure boolean normalization so prospect reference flag is persisted (was reported as always 0)
  const cRef = data.c_reference_status === true || (typeof (data as any).c_reference_status === 'string' && (data as any).c_reference_status.toLowerCase() === 'true');
  r.addParameter('CRef', TYPES.Bit, cRef);
      r.addParameter('CounselInstr', TYPES.Bit, data.context_type === 'C' ? data.counsel_instructed : null);
      r.addParameter('CounselName', TYPES.NVarChar, data.context_type === 'C' && data.counsel_instructed ? data.counsel_name : null);
  let insertedId: string | undefined;
  r.on('row', cols => { if (cols[0]?.value) insertedId = String(cols[0].value); });
  r.on('requestCompleted', () => { connection.close(); resolve({ success: true, message: 'Inserted', insertedId }); });
      connection.execSql(r);
    });
    connection.on('error', e => reject(e));
    connection.connect();
  });
}

/**
 * Fetch all notable case entries for a specific matter
 */
async function fetchNotableCaseHistory(displayNumber: string): Promise<NotableCaseEntry[]> {
  const cs = process.env.TeamsSQLConnectionString; if (!cs) return [];
  const cfg = parseConnectionString(cs);
  return new Promise<NotableCaseEntry[]>((resolve, reject) => {
    const connection = new Connection(cfg); const results: NotableCaseEntry[] = [];
    connection.on('connect', err => {
      if (err) { reject(err); return; }
      const q = 'SELECT id, initials, display_number, summary, value_in_dispute, c_reference_status, counsel_instructed, counsel_name, created_at FROM notable_case_info WHERE display_number = @DisplayNumber ORDER BY created_at DESC';
      const r = new SqlRequest(q, e => { if (e) { reject(e); connection.close(); } });
      r.addParameter('DisplayNumber', TYPES.VarChar, displayNumber);
      r.on('row', c => results.push({ id: c[0].value, initials: c[1].value, display_number: c[2].value, summary: c[3].value, value_in_dispute: c[4].value, c_reference_status: c[5].value, counsel_instructed: c[6].value, counsel_name: c[7].value, created_at: c[8].value }));
      r.on('requestCompleted', () => { connection.close(); resolve(results); });
      connection.execSql(r);
    });
    connection.on('error', e => reject(e));
    connection.connect();
  });
}

/**
 * Send notification email using Microsoft Graph
 */
async function sendNotificationEmail(data: InsertNotableCaseInfoRequest, related: Matter[], context: InvocationContext) {
  try {
    let history: NotableCaseEntry[] = [];
    if (data.context_type === 'C' && data.display_number) { try { history = await fetchNotableCaseHistory(data.display_number); } catch { /* ignore */ } }
    const tenantId = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';
    const kvUri = 'https://helix-keys.vault.azure.net/';
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const [cid, csec] = await Promise.all([
      secretClient.getSecret('graph-pitchbuilderemailprovider-clientid'),
      secretClient.getSecret('graph-pitchbuilderemailprovider-clientsecret')
    ]);
    if (!cid.value || !csec.value) throw new Error('Missing Graph creds');
    const tokenResp = await axios.post(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, new URLSearchParams({ client_id: cid.value, client_secret: csec.value, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const token = tokenResp.data.access_token; if (!token) throw new Error('No token');
    const ref = data.context_type === 'C' ? data.display_number : data.prospect_id;
    const headingType = data.context_type === 'C' ? 'CLIENT MATTER' : 'PROSPECT / ENQUIRY';
    const intro = data.context_type === 'C' ? 'A new notable client matter submission has been recorded.' : 'A new notable prospect / enquiry submission has been recorded.';
    const classify = data.context_type === 'C' ? '<p style="margin:0 0 12px 0;font-size:13px;color:#2563eb"><strong>Classification:</strong> Client Matter (reference provided)</p>' : '<p style="margin:0 0 12px 0;font-size:13px;color:#7c3aed"><strong>Classification:</strong> Prospect / Enquiry (no formal file opened yet)</p>';
    const relatedTable = data.context_type === 'C' ? (related.length ? `<h3 style=\"margin:24px 0 8px 0;font-size:15px;color:#111\">Related Matters</h3><table cellpadding=6 cellspacing=0 style=\"border:1px solid #e5e7eb;border-collapse:collapse;width:100%;font-size:13px\"><thead><tr style=\"background:#f1f5f9;text-align:left\"><th style=\"border:1px solid #e5e7eb\">Display Number</th><th style=\"border:1px solid #e5e7eb\">Client Name</th><th style=\"border:1px solid #e5e7eb\">Matter Description</th><th style=\"border:1px solid #e5e7eb\">Fee Earner</th></tr></thead><tbody>${related.map(m => `<tr><td style=\\\"border:1px solid #e5e7eb\\\">${m.display_number}</td><td style=\\\"border:1px solid #e5e7eb\\\">${m.client_name}</td><td style=\\\"border:1px solid #e5e7eb\\\">${m.matter_description}</td><td style=\\\"border:1px solid #e5e7eb\\\">${m.fee_earner}</td></tr>`).join('')}</tbody></table>` : '<p style="font-size:12px;color:#555"><em>No related matters found.</em></p>') : '';
    const historyTable = data.context_type === 'C' ? (history.length ? `<h3 style=\"margin:28px 0 8px 0;font-size:15px;color:#111\">Previous Notable Case Entries</h3><table cellpadding=6 cellspacing=0 style=\"border:1px solid #e5e7eb;border-collapse:collapse;width:100%;font-size:12px\"><thead><tr style=\"background:#eef6ff;text-align:left\"><th style=\"border:1px solid #e5e7eb\">Date</th><th style=\"border:1px solid #e5e7eb\">By</th><th style=\"border:1px solid #e5e7eb\">Summary</th><th style=\"border:1px solid #e5e7eb\">Value</th><th style=\"border:1px solid #e5e7eb\">Ref?</th><th style=\"border:1px solid #e5e7eb\">Counsel</th></tr></thead><tbody>${history.map(h => `<tr><td style=\\\"border:1px solid #e5e7eb\\\">${new Date(h.created_at).toLocaleDateString('en-GB')}</td><td style=\\\"border:1px solid #e5e7eb\\\">${h.initials}</td><td style=\\\"border:1px solid #e5e7eb\\\">${h.summary}</td><td style=\\\"border:1px solid #e5e7eb\\\">${h.value_in_dispute || '—'}</td><td style=\\\"border:1px solid #e5e7eb\\\">${h.c_reference_status ? 'Yes' : 'No'}</td><td style=\\\"border:1px solid #e5e7eb\\\">${h.counsel_instructed ? (h.counsel_name || 'Yes') : 'No'}</td></tr>`).join('')}</tbody></table>` : '<p style="font-size:12px;color:#555"><em>No previous notable case entries.</em></p>') : '<p style="font-size:12px;color:#555;margin-top:20px"><em>History will appear once a formal file reference exists.</em></p>';
    const rows: string[] = [];
    rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;width:230px;border:1px solid #e2e8f0;padding:6px 10px\\\">Submitted by (FE)</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.initials}</td></tr>`);
    rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">${data.context_type === 'C' ? 'File Reference' : 'Prospect / Enquiry ID'}</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${ref}</td></tr>`);
    rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">Brief Summary</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.summary}</td></tr>`);
    if (data.merit_press) rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">PR Merit</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.merit_press}</td></tr>`);
    rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">Indication of Value</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.value_in_dispute || 'Not specified'}</td></tr>`);
    if (data.value_in_dispute_exact) rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">Exact Value (>500k)</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.value_in_dispute_exact}</td></tr>`);
    rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">${data.context_type === 'C' ? 'Client' : 'Prospect'} Prepared to Provide Reference</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.c_reference_status ? 'Yes' : 'No'}</td></tr>`);
    if (data.context_type === 'C') { rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">Counsel Instructed</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.counsel_instructed ? 'Yes' : 'No'}</td></tr>`); if (data.counsel_instructed) rows.push(`<tr><td style=\\\"background:#f8fafc;font-weight:600;border:1px solid #e2e8f0;padding:6px 10px\\\">Counsel Name</td><td style=\\\"border:1px solid #e2e8f0;padding:6px 10px\\\">${data.counsel_name || 'Not specified'}</td></tr>`); }
    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;"><div style="background:linear-gradient(135deg,#eff6ff,#ffffff);padding:14px 18px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:18px;box-shadow:0 2px 4px rgba(0,0,0,0.04)"><h1 style="margin:0;font-size:18px;letter-spacing:.5px;color:#111827;text-transform:uppercase">Notable ${headingType}</h1>${classify}<p style="margin:4px 0 0 0;font-size:14px">${intro}</p></div><table cellpadding=0 cellspacing=0 style="width:100%;margin:0 0 20px 0;border-collapse:separate;border-spacing:0 6px;">${rows.join('')}</table>${relatedTable}${historyTable}<p style="font-size:12px;color:#666;margin-top:30px">This email was automatically generated by the Helix Hub system.</p></body></html>`;
    const mail = { message: { subject: `Notable ${data.context_type === 'C' ? 'Case' : 'Prospect'} Information Submitted - ${ref}`, body: { contentType: 'HTML', content: html }, toRecipients: [
      { emailAddress: { address: 'lz@helix-law.com' } },
      { emailAddress: { address: 'ac@helix-law.com' } }
    ], from: { emailAddress: { address: 'automations@helix-law.com' } } }, saveToSentItems: 'false' };
    const resp = await axios.post('https://graph.microsoft.com/v1.0/users/automations@helix-law.com/sendMail', mail, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    return { success: resp.status === 202 };
  } catch (e) { context.error('Email error', e); return { success: false, error: e instanceof Error ? e.message : 'unknown error' }; }
}

/**
 * Handler for the insertNotableCaseInfo Azure Function
 */
export async function insertNotableCaseInfoHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') return { status: 204, headers: cors };
  if (req.method !== 'POST') return { status: 405, headers: cors, body: 'Method Not Allowed' };
  let body: InsertNotableCaseInfoRequest; try { body = await getRequestBody(req); } catch { return { status: 400, headers: cors, body: 'Invalid JSON' }; }
  const missing = !body.initials || !body.summary || !body.context_type || (body.context_type === 'C' && !body.display_number) || (body.context_type === 'P' && !body.prospect_id);
  if (missing) return { status: 400, headers: cors, body: 'Missing required fields' };
  try {
    const kvUri = 'https://helix-keys.vault.azure.net/';
    const sqlServer = 'helix-database-server.database.windows.net';
    const sqlDatabase = 'helix-project-data';
    let password = '';
    const local = process.env.SQL_CONNECTION_STRING;
    if (local) { const m = local.match(/Password=([^;]+)/); password = m ? m[1] : ''; if (!password) throw new Error('Password extract failed'); }
    else { const sc = new SecretClient(kvUri, new DefaultAzureCredential()); const pw = await sc.getSecret('sql-databaseserver-password'); password = pw.value || ''; if (!password) throw new Error('Password secret missing'); }
    const conn = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
    const cfg = parseConnectionString(conn);
    const related = body.context_type === 'C' && body.display_number ? await lookupRelatedMatters(body.display_number, cfg) : [];
  const ins = await insertNotableCaseInfo(body, cfg);
    const email = await sendNotificationEmail(body, related, context);
    const resp = { message: 'Notable case information submitted successfully.', insertedId: ins.insertedId, emailSent: email.success, emailSkipped: false, relatedMattersFound: related.length, runtimeVersion: 'v4' };
    return { status: 201, headers: cors, body: JSON.stringify(resp) };
  } catch (e) { return { status: 500, headers: cors, body: JSON.stringify({ error: 'Processing error', details: e instanceof Error ? e.message : String(e) }) }; }
}

// Register the function
// NOTE: authLevel set to 'anonymous' for local testing; revert to 'function' before production deployment
app.http('insertNotableCaseInfo', { methods: ['POST','OPTIONS'], authLevel: 'anonymous', handler: insertNotableCaseInfoHandler });
export default app;
