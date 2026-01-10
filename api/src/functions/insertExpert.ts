import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

interface InsertExpertRequest {
  prefix: string;
  first_name: string;
  last_name: string;
  company_name: string;
  company_number: string;
  email: string;
  phone: string;
  website: string;
  cv_url: string;
  area_of_work: string;
  worktype: string;
  introduced_by: string;
  source: string;
  notes: string;
  created_by: string;
  created_by_initials: string;
}

interface InsertResult {
  success: boolean;
  message: string;
  insertedId?: number;
}

async function getRequestBody(req: HttpRequest): Promise<InsertExpertRequest> {
  if (req.body && typeof req.body === 'object' && !(req.body as any).getReader) return req.body as any;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  if (req.body && typeof (req.body as any).getReader === 'function') {
    const reader = (req.body as any).getReader();
    let chunks = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks += typeof value === 'string' ? value : new TextDecoder().decode(value);
    }
    return JSON.parse(chunks);
  }
  throw new Error('Empty body');
}

function parseConnectionString(connectionString: string) {
  const parts = connectionString.split(';').filter(Boolean);
  const config: any = { server: '', options: { encrypt: true } };
  for (const part of parts) {
    const [k, ...rest] = part.split('=');
    const key = k.trim();
    const value = rest.join('=').trim();
    switch (key) {
      case 'Server': config.server = value; break;
      case 'Database': config.options.database = value; break;
      case 'User ID':
        config.authentication = config.authentication || { type: 'default', options: { userName: '', password: '' } };
        config.authentication.options.userName = value;
        break;
      case 'Password':
        config.authentication = config.authentication || { type: 'default', options: { userName: '', password: '' } };
        config.authentication.options.password = value;
        break;
      case 'Encrypt': config.options.encrypt = value.toLowerCase() === 'true'; break;
      case 'TrustServerCertificate': config.options.trustServerCertificate = value.toLowerCase() === 'true'; break;
    }
  }
  return config;
}

async function insertExpert(data: InsertExpertRequest, config: any): Promise<InsertResult> {
  return new Promise<InsertResult>((resolve, reject) => {
    const connection = new Connection(config);
    connection.on('connect', err => {
      if (err) {
        reject(err);
        return;
      }
      const q = `INSERT INTO dbo.expert_recommendations 
        (submitted_by, prefix, first_name, last_name, company_name, company_number, email, phone, website, cv_url, area_of_work, worktype, introduced_by, source, notes)
        OUTPUT Inserted.id
        VALUES (@SubmittedBy, @Prefix, @FirstName, @LastName, @CompanyName, @CompanyNumber, @Email, @Phone, @Website, @CvUrl, @AreaOfWork, @Worktype, @IntroducedBy, @Source, @Notes);`;
      
      const r = new SqlRequest(q, e => {
        if (e) {
          reject(e);
          connection.close();
        }
      });
      
      r.addParameter('SubmittedBy', TYPES.NVarChar, data.created_by_initials || null);
      r.addParameter('Prefix', TYPES.NVarChar, data.prefix || null);
      r.addParameter('FirstName', TYPES.NVarChar, data.first_name);
      r.addParameter('LastName', TYPES.NVarChar, data.last_name);
      r.addParameter('CompanyName', TYPES.NVarChar, data.company_name || null);
      r.addParameter('CompanyNumber', TYPES.NVarChar, data.company_number || null);
      r.addParameter('Email', TYPES.NVarChar, data.email || null);
      r.addParameter('Phone', TYPES.NVarChar, data.phone || null);
      r.addParameter('Website', TYPES.NVarChar, data.website || null);
      r.addParameter('CvUrl', TYPES.NVarChar, data.cv_url || null);
      r.addParameter('AreaOfWork', TYPES.NVarChar, data.area_of_work);
      r.addParameter('Worktype', TYPES.NVarChar, data.worktype);
      r.addParameter('IntroducedBy', TYPES.NVarChar, data.introduced_by || null);
      r.addParameter('Source', TYPES.NVarChar, data.source || null);
      r.addParameter('Notes', TYPES.NVarChar, data.notes || null);
      
      let insertedId: number | undefined;
      r.on('row', cols => {
        if (cols[0]?.value) insertedId = Number(cols[0].value);
      });
      r.on('requestCompleted', () => {
        connection.close();
        resolve({ success: true, message: 'Expert recommendation saved successfully', insertedId });
      });
      connection.execSql(r);
    });
    connection.on('error', e => reject(e));
    connection.connect();
  });
}

export async function insertExpertHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('insertExpert function triggered');

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return { status: 204, headers: corsHeaders };
  }

  try {
    const data = await getRequestBody(request);
    context.log('Received expert data:', { first_name: data.first_name, last_name: data.last_name, area_of_work: data.area_of_work });

    // Validate required fields
    if (!data.first_name?.trim()) {
      return {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'First name is required' }),
      };
    }
    if (!data.last_name?.trim()) {
      return {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Last name is required' }),
      };
    }
    if (!data.area_of_work?.trim()) {
      return {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Area of Work is required' }),
      };
    }
    if (!data.worktype?.trim()) {
      return {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Work Type is required' }),
      };
    }

    // Get connection string (helix-core-data database)
    const connectionString = process.env.SQL_CONNECTION_STRING;
    if (!connectionString) {
      context.log('ERROR: SQL_CONNECTION_STRING not configured');
      return {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Database connection not configured' }),
      };
    }

    const config = parseConnectionString(connectionString);
    const result = await insertExpert(data, config);

    context.log('Expert recommendation saved successfully:', result);
    return {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    context.log('ERROR inserting expert recommendation:', errorMessage);
    return {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errorMessage }),
    };
  }
}

app.http('insertExpert', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'experts',
  handler: insertExpertHandler,
});
