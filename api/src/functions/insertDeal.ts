// invisible change
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const DEAL_CAPTURE_BASE_URL =
  process.env.DEAL_CAPTURE_BASE_URL ||
  "https://instructions-vnet-functions.azurewebsites.net/api/dealCapture";

//
// Search for this token to quickly find the insertDeal handler and recent changes.


interface ClientInfo {
  clientId?: number;
  prospectId?: number;
  clientEmail: string;
  isLeadClient?: boolean;
}

interface DealRequest {
  serviceDescription?: string;
  /**
   * Legacy / frontend field name. If present we treat this as serviceDescription.
   */
  initialScopeDescription?: string;
  amount: number;
  areaOfWork: string;
  prospectId: string;
  pitchedBy: string;
  isMultiClient: boolean;
  leadClientEmail: string;
  leadClientId: number;
  clients?: ClientInfo[];
  passcode?: string;
  /** Optional: frontend-provided email recipients used for the client email */
  emailRecipients?: {
    to?: string;
    cc?: string;
    bcc?: string;
    feeEarnerEmail?: string;
  };
}

import axios from "axios";

/**
 * Look up fee earner email from team data based on their full name
 * This uses a simplified lookup table. In production, this could be enhanced
 * to fetch from a shared team API or database.
 */
function getFeeEarnerEmail(pitchedBy: string): string | null {
  try {
    if (!pitchedBy || typeof pitchedBy !== 'string') {
      return null;
    }

    // Normalize the input (trim and handle case variations)
    const normalizedName = pitchedBy.trim();
    
    // Team member lookup table - this should be kept in sync with the dbo.team SQL table
    // Consider fetching from /api/team-data in the future for dynamic lookup
    const teamLookup: { [key: string]: string } = {
      "Alex Cook": "ac@helix-law.com",
      "Anouszka Taverna": "at@helix-law.com", 
      "Billy Leith": "bl@helix-law.com",
      "Caroline Hennessy": "ch@helix-law.com",
      "Charlotte Ramsden": "cr@helix-law.com",
      "Daisy Wickham": "dw@helix-law.com",
      "Daniel Gordon": "dg@helix-law.com",
      "Daniel Lee": "dl@helix-law.com",
      "Dominic Lund": "dl2@helix-law.com",
      "Emily Stringer": "es@helix-law.com",
      "Francesca Fleming": "ff@helix-law.com",
      "George Haste": "gh@helix-law.com",
      "Gemma Pinnington": "gp@helix-law.com",
      "Harriet Knowles": "hk@helix-law.com",
      "James McKinney": "jm@helix-law.com",
      "James Pickering": "jp@helix-law.com",
      "Kelly Caddick": "kc@helix-law.com",
      "Lauren Davis": "ld@helix-law.com",
      "Leah Zimmerer": "lz@helix-law.com",
      "Mark Torbitt": "mt@helix-law.com",
      "Matthew Clarke": "mc@helix-law.com",
      "Meghan Ashworth": "ma@helix-law.com",
      "Nicholas Davidson": "nd@helix-law.com",
      "Ollie Lund": "ol@helix-law.com",
      "Orla Costello": "oc@helix-law.com",
      "Richard Poulter": "rp@helix-law.com",
      "Robert Birnie": "rb@helix-law.com",
      "Sara Lovell": "sl@helix-law.com",
      "Sophie Long": "slong@helix-law.com",
      "Sophie Williams": "sw@helix-law.com",
      "Stephanie Horton": "sh@helix-law.com",
      "Thomas Keyzor": "tk@helix-law.com",
      "Victoria Holden": "vh@helix-law.com"
    };
    
    // Direct lookup first
    if (teamLookup[normalizedName]) {
      return teamLookup[normalizedName];
    }
    
    // Fallback: try case-insensitive lookup
    const lowerName = normalizedName.toLowerCase();
    for (const [name, email] of Object.entries(teamLookup)) {
      if (name.toLowerCase() === lowerName) {
        return email;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Send an admin monitoring email to lz@helix-law.com with a full snapshot
 * of the deal that was captured and the email metadata.
 * Also CC the fee earner who pitched the deal.
 */
async function sendDealCapturedEmail(context: InvocationContext, dealInfo: any) {
  try {
    const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";
    const kvUri = "https://helix-keys.vault.azure.net/";
    const credential = new DefaultAzureCredential();
    const secretClient = new SecretClient(kvUri, credential);

    const clientId = (await secretClient.getSecret(
      "graph-pitchbuilderemailprovider-clientid"
    )).value;
    const clientSecret = (await secretClient.getSecret(
      "graph-pitchbuilderemailprovider-clientsecret"
    )).value;

    const tokenResponse = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: clientId ?? "",
        client_secret: clientSecret ?? "",
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const baseInstructions = process.env.DEAL_INSTRUCTIONS_URL || 'https://instruct.helix-law.com/pitch';
    const instructionsUrl = `${baseInstructions.replace(/\/$/, '')}/${encodeURIComponent(dealInfo.passcode ?? '')}`;

    // Get fee earner email for CC
    const feeEarnerEmail = getFeeEarnerEmail(dealInfo.pitchedBy || '');

    const now = new Date();
    const htmlRows = (obj: any) => Object.entries(obj)
      .map(([k, v]) => `<tr><td style="padding:4px 8px;border:1px solid #ddd"><strong>${k}</strong></td><td style="padding:4px 8px;border:1px solid #ddd">${String(v ?? '')}</td></tr>`)
      .join('');

  const dealSnapshot = {
      InstructionRef: dealInfo.instructionRef ?? '',
      DealId: dealInfo.dealId ?? '',
      ProspectId: dealInfo.prospectId ?? '',
  LeadClientId: dealInfo.leadClientId ?? '',
      Passcode: dealInfo.passcode ?? '',
      ServiceDescription: dealInfo.serviceDescription ?? '',
      Amount: dealInfo.amount ?? '',
      AreaOfWork: dealInfo.areaOfWork ?? '',
      PitchedBy: dealInfo.pitchedBy ?? '',
      IsMultiClient: dealInfo.isMultiClient ? 'yes' : 'no',
      LeadClientEmail: dealInfo.leadClientEmail ?? '',
      To: (dealInfo.emailRecipients?.to || dealInfo.leadClientEmail || 'N/A'),
      CC: (dealInfo.emailRecipients?.cc || '—'),
      BCC: (dealInfo.emailRecipients?.bcc || '—'),
      AllClientEmails: Array.isArray(dealInfo.clients)
        ? dealInfo.clients.map((c: any) => c.clientEmail || c.email || '').filter(Boolean).join(', ') || (dealInfo.leadClientEmail ? dealInfo.leadClientEmail : 'N/A')
        : (dealInfo.leadClientEmail ? dealInfo.leadClientEmail : 'N/A'),
      InstructionsUrl: instructionsUrl,
      GeneratedAt: now.toISOString(),
    };

    const emailHtml = `
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#111">
        <h2>🎯 Deal Captured Successfully</h2>
        <p><strong>Status:</strong> <span style="color:#22c55e;font-weight:600;">CAPTURED</span> - Deal saved to database and available for instructions app</p>
        
        <h3>Deal snapshot</h3>
        <table style="border-collapse:collapse;border:1px solid #ddd">${htmlRows(dealSnapshot)}</table>
        
        <h3 style="margin-top:16px">Next Steps</h3>
        <ul style="line-height:1.6">
          <li>Client will access: <a href="${instructionsUrl}" style="color:#0066cc">${instructionsUrl}</a></li>
          <li>Deal data will be automatically loaded into instructions app</li>
          <li>Fee earner ${dealInfo.pitchedBy || 'N/A'} will receive notification when client completes process</li>
        </ul>
        
        <h3 style="margin-top:16px">Original payload (JSON)</h3>
        <pre style="background:#f6f6f6;padding:8px;border-radius:4px;max-height:220px;overflow:auto">${JSON.stringify(dealInfo, null, 2)}</pre>
        
        <p style="margin-top:12px;color:#666;font-size:12px">
          📧 Delivered to: lz@helix-law.com, cb@helix-law.com${feeEarnerEmail ? ` | CC: ${feeEarnerEmail}` : ''} — this message is for monitoring only.
        </p>
      </div>`;

    // Build recipients list
    const toRecipients = [
      { emailAddress: { address: 'lz@helix-law.com' } },
      { emailAddress: { address: 'cb@helix-law.com' } }
    ];
    const ccRecipients = feeEarnerEmail ? [{ emailAddress: { address: feeEarnerEmail } }] : [];

    // Log CC information
    if (feeEarnerEmail) {
      context.log(`Admin monitoring email: CC'ing fee earner ${dealInfo.pitchedBy} at ${feeEarnerEmail}`);
    } else {
      context.log(`Admin monitoring email: No email found for fee earner '${dealInfo.pitchedBy}'`);
    }

    const emailContent = {
      message: {
        subject: `✅ Deal Captured: ${dealInfo.serviceDescription ?? 'unknown service'} (£${dealInfo.amount})`,
        body: { contentType: 'HTML', content: emailHtml },
        toRecipients,
        ccRecipients,
        from: { emailAddress: { address: 'automations@helix-law.com' } },
      },
      saveToSentItems: false,
    };

    await axios.post(
      `https://graph.microsoft.com/v1.0/users/automations@helix-law.com/sendMail`,
      emailContent,
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    context.error('Failed to send deal captured notification email', err);
  }
}


export async function insertDealHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("insertDealHandler invoked");

  if (req.method !== "POST") {
    return {
      status: 405,
      body: JSON.stringify({ error: "Method not allowed", allowed: ["POST"] }),
      headers: { "Content-Type": "application/json" },
    };
  }

  let body: DealRequest;
  try {
    body = await req.json() as DealRequest;
    // Log incoming payload for debugging (local dev only)
    try {
      context.log('insertDeal received body:', JSON.stringify(body));
    } catch (e) {
      context.log('insertDeal received body (stringify failed)');
    }
  } catch (error) {
    context.error("Invalid JSON body", error);
    return {
      status: 400,
      body: JSON.stringify({ error: "Invalid JSON", details: String(error) }),
      headers: { "Content-Type": "application/json" },
    };
  }

  // Quick developer shortcut: send the header 'x-insertdeal-auto-test: 1' to
  // trigger an automated test payload (amount 0 and a short monitored description).
  // This lets you hit the same code path without crafting the full payload.
  try {
    const getHeader = (name: string) => {
      try {
        // HttpRequest.headers implements get in the @azure/functions types
        // but may also be a plain object in some runtimes; try both.
        // @ts-ignore
        if (typeof req.headers?.get === 'function') return req.headers.get(name) ?? req.headers.get(name.toLowerCase());
        // @ts-ignore
        return req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
      } catch (err) {
        return undefined;
      }
    };
    const autoTestHeader = getHeader('x-insertdeal-auto-test');
    const isAutoTest = String(autoTestHeader ?? '').toLowerCase() === '1' || String(autoTestHeader ?? '').toLowerCase() === 'true';
    if (isAutoTest) {
      context.log('insertDeal: auto-test header detected, using test payload');
      body = {
        serviceDescription: 'System running but turned off (under the hood it works)',
        amount: 0,
        areaOfWork: 'Commercial',
        prospectId: 'P-100',
        pitchedBy: 'AutomatedTest',
        isMultiClient: false,
        leadClientEmail: 'client@example.com',
        leadClientId: 0,
        clients: [],
      } as DealRequest;
    }
  } catch (e) {
    context.log('insertDeal: error evaluating auto-test header', e);
  }

const {
  serviceDescription: svcDesc,
  initialScopeDescription,
  amount,
  areaOfWork,
  prospectId,
  pitchedBy,
  isMultiClient,
  leadClientEmail,
  leadClientId,
  clients,
  emailRecipients
} = body;

// Frontend sometimes sends `initialScopeDescription` — treat it as `serviceDescription` when needed
let serviceDescription = svcDesc ?? initialScopeDescription;

// Removed legacy sanitiser that replaced serviceDescription when it resembled an email body.

  // Generate a 5 digit numerical passcode if not provided
  const passcode = body.passcode || Math.floor(10000 + Math.random() * 90000).toString();

  const missingFields: string[] = [];
  if (!serviceDescription) missingFields.push("serviceDescription|initialScopeDescription");
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) missingFields.push("amount");
  if (!areaOfWork) missingFields.push("areaOfWork");
  if (!prospectId) missingFields.push("prospectId");
  if (!pitchedBy) missingFields.push("pitchedBy");
  if (!leadClientEmail) missingFields.push("leadClientEmail");

  if (missingFields.length > 0) {
    context.warn("Validation failed - missing fields", missingFields);
    // Also return which of the expected fields were present to aid debugging
    const receivedPresence: { [k: string]: any } = {
      serviceDescription: !!(svcDesc ?? initialScopeDescription),
      amount: !(amount === undefined || amount === null || Number.isNaN(Number(amount))),
      areaOfWork: !!areaOfWork,
      prospectId: !!prospectId,
      pitchedBy: !!pitchedBy,
      leadClientEmail: !!leadClientEmail,
    };
    return {
      status: 400,
      body: JSON.stringify({ error: "Missing required fields", missing: missingFields, received: receivedPresence }),
      headers: { "Content-Type": "application/json" },
    };
  }

  try {
    const kvUri = "https://helix-keys.vault.azure.net/";

    let code = process.env.DEAL_CAPTURE_CODE;
    if (!code) {
      const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
      const secret = await secretClient.getSecret("dealCapture-code");
      code = secret.value;
    }

    if (!code) {
      context.error("Deal capture code missing in configuration");
      return { status: 500, body: "Deal capture code not configured" };
    }

    const url = `${DEAL_CAPTURE_BASE_URL}?code=${code}`;

    // ProspectId handling: do NOT strip digits or alter formatting beyond validation.
    // Accept only wholly numeric strings (may include leading zeros) or numbers.
    // Preserve the original digit sequence for references; derive numeric for DB bounds check only.
    const toNumericIfValid = (raw?: string | number | undefined): { raw: string; num: number } | null => {
      if (raw === undefined || raw === null) return null;
      const rawStr = String(raw).trim();
      if (!/^\d+$/.test(rawStr)) return null; // reject if any non-digit
      // Keep leading zeros in rawStr; convert to number separately (leading zeros dropped, fine for bounds)
      const num = Number(rawStr);
      if (!Number.isSafeInteger(num)) return null;
      return { raw: rawStr, num };
    };

    const prospectMeta = toNumericIfValid(prospectId as unknown as string | number);
    if (!prospectMeta) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Invalid prospectId", detail: "prospectId must be all digits" }),
        headers: { "Content-Type": "application/json" },
      };
    }

  const normalizedProspectId = prospectMeta.num;
  const rawProspectId = prospectMeta.raw; // preserve for instructionRef / auditing
    if (normalizedProspectId === null) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Invalid prospectId", detail: "prospectId must contain a numeric id" }),
        headers: { "Content-Type": "application/json" },
      };
    }

  // InstructionRef uses HLX-<prospectId>-<passcode> format and is zero-padded to 5 digits
  // Examples: HLX-27367-49674 or HLX-00016-16093
  const pad = (v: number | string, width = 5) => String(v).padStart(width, "0");
  const passcodeStr = String(passcode).padStart(5, "0");
  // Use rawProspectId (with its original leading zeros) when forming InstructionRef for better traceability
  const instructionRef = `HLX-${pad(rawProspectId)}-${passcodeStr}`;

    const normalizedClients = (clients || []).map(c => {
      if (c.prospectId === undefined || c.prospectId === null) {
        return { ...c, prospectId: null };
      }
      const meta = toNumericIfValid(c.prospectId as unknown as string | number);
      return {
        clientId: c.clientId,
        prospectId: meta ? meta.num : null,
        clientEmail: c.clientEmail,
        isLeadClient: c.isLeadClient ?? false,
        rawProspectId: meta ? meta.raw : undefined,
      };
    });

    // If any client prospectId was present but couldn't be normalized, reject
    const badClient = normalizedClients.find(c => c.prospectId === null && c.clientId !== undefined);
    if (badClient) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Invalid client prospectId", clientId: badClient.clientId }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const payload = {
      serviceDescription,
      amount,
      areaOfWork,
      prospectId: normalizedProspectId,
  rawProspectId,
  instructionRef,
      passcode,
      pitchedBy,
      isMultiClient,
      leadClientEmail,
  leadClientId: leadClientId ?? normalizedProspectId,
      clients: normalizedClients,
    };

    const response = await axios.post(url, payload);
  if (response.status >= 200 && response.status < 300) {
  const result = typeof response.data === 'object' ? response.data : {};
  const upstreamDealId = result.dealId ?? result.DealId ?? null;
  const baseInstructions = process.env.DEAL_INSTRUCTIONS_URL || 'https://instruct.helix-law.com/pitch';
  const instructionsUrl = `${baseInstructions.replace(/\/$/, '')}/${encodeURIComponent(passcode)}`;
  const dealInfo = {
    serviceDescription: serviceDescription!,
    amount,
    passcode,
    prospectId: normalizedProspectId,
    instructionRef: instructionRef,
    pitchedBy: pitchedBy || null,
    isMultiClient: Array.isArray(clients) && clients.length > 1,
    leadClientEmail: leadClientEmail || null,
  leadClientId: leadClientId ?? normalizedProspectId,
    clients: clients || [],
    dealId: upstreamDealId,
    emailRecipients: emailRecipients || undefined,
  };

  await sendDealCapturedEmail(context, dealInfo);
      return {
        status: 200,
        body: JSON.stringify({
          message: "Deal captured",
          passcode,
          instructionRef,
          instructionsUrl,
          ...result,
        }),
        headers: { "Content-Type": "application/json" },
      };
    }
  return { status: response.status, body: JSON.stringify({ error: response.statusText }), headers: { "Content-Type": "application/json" } };
  } catch (error: any) {
    context.error("Error capturing deal", error);
    const upstreamStatus = error.response?.status;
    const upstreamData = error.response?.data;
    const message = error.message ?? "Unknown error";

    // Safely stringify upstream data for the response body
    let upstreamDataSafe: unknown = upstreamData;
    try {
      // If it's an object, keep as-is for JSON response; else include raw
      if (typeof upstreamData === "string") {
        upstreamDataSafe = upstreamData;
      }
    } catch (e) {
      upstreamDataSafe = String(upstreamData);
    }

    return {
      status: 500,
      body: JSON.stringify({
        error: "Error capturing deal",
        message,
        upstreamStatus: upstreamStatus ?? null,
        upstreamResponse: upstreamDataSafe ?? null,
      }),
      headers: { "Content-Type": "application/json" },
    };
  }
}

app.http("insertDeal", {
  methods: ["POST"],
  authLevel: "function",
  handler: insertDealHandler,
});

export default app;