
// invisible change
// src/functions/getMatters.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface RequestBody {
  fullName: string;
}

// Define the interface for the SQL query result
export interface MatterData {
  [key: string]: any;
}

// Define the handler function
export async function getMattersHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Invocation started for getMatters Azure Function.");

  // Basic CORS / preflight support for local development and browser calls
  if (req.method === 'OPTIONS') {
    return {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      },
      body: ''
    };
  }

  let body: RequestBody | undefined;

  try {
    // Accept JSON body (POST) or query string (GET) for convenience in local dev
    if (req.method === 'POST') {
      body = await req.json() as RequestBody;
    }
    const fullNameFromQuery = (req.query?.get?.("fullName") || (req as any).query?.fullName) as string | undefined;
    if (!body && fullNameFromQuery) {
      body = { fullName: fullNameFromQuery };
    }
    context.log("Request params:", { fullName: body?.fullName, method: req.method });
  } catch (error) {
    context.error("Error parsing JSON body:", error);
    return {
      status: 400,
      headers: corsHeaders(),
      body: "Invalid JSON format in request body."
    };
  }

  const fullName = body?.fullName;

  if (!fullName) {
    context.warn("Missing 'fullName' in request body.");
    return {
      status: 400,
      headers: corsHeaders(),
      body: "Missing 'fullName' in request body."
    };
  }

  try {
    context.log("Initiating SQL query to retrieve matters.");
    const matters = await queryMattersFromSQL(fullName, context);
    context.log("Successfully retrieved matters from SQL database.", { matters });

    return {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(matters)
    };
  } catch (error) {
    context.error("Error retrieving matters:", error);
    return {
      status: 500,
      headers: corsHeaders(),
      body: "Error retrieving matters."
    };
  } finally {
    context.log("Invocation completed for getMatters Azure Function.");
  }
}

// Register the function
app.http("getMatters", {
  // Enable GET for local testing convenience; keep POST for parity with production usage
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "function",
  handler: getMattersHandler
});

// Implement the SQL query function
async function queryMattersFromSQL(fullName: string, context: InvocationContext): Promise<MatterData[]> {
  // Build tedious config supporting local env overrides; fallback to Key Vault for production
  const config = await buildSqlConfig(context);

  return new Promise<MatterData[]>((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error:", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error:", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      const query = `
        SELECT *
        FROM matters
        WHERE [Responsible Solicitor] = @FullName
           OR [Originating Solicitor] = @FullName;
      `;

      const sqlRequest = new SqlRequest(query, (err, rowCount) => {
        if (err) {
          context.error("SQL Query Execution Error:", err);
          reject("SQL query failed.");
          connection.close();
          return;
        }

        context.log(`SQL query executed successfully. Rows returned: ${rowCount}`);
      });

      const result: MatterData[] = [];

      sqlRequest.on('row', (columns) => {
        const row: MatterData = {};
        columns.forEach((column: { metadata: { colName: string }, value: any }) => {
          row[column.metadata.colName] = column.value;
        });
        result.push(row);
      });

      sqlRequest.on('requestCompleted', () => {
        resolve(result);
        connection.close();
      });

      sqlRequest.addParameter('FullName', TYPES.NVarChar, fullName);

      connection.execSql(sqlRequest);
    });

    connection.connect();
  });
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString: string, context: InvocationContext): any {
  const parts = connectionString.split(';');
  const config: any = {};

  parts.forEach(part => {
    const [key, value] = part.split('=');
    if (!key || !value) {
      return;
    }

    switch (key.trim()) {
      case 'Server':
        config.server = value;
        break;
      case 'Database':
        config.options = { ...config.options, database: value };
        break;
      case 'User ID':
        config.authentication = {
          type: 'default',
          options: { userName: value, password: '' }
        };
        break;
      case 'Password':
        if (!config.authentication) {
          config.authentication = { type: 'default', options: { userName: '', password: '' } };
        }
        config.authentication.options.password = value;
        break;
      default:
        break;
    }
  });

  // Additional options for secure connections
  config.options = {
    ...config.options,
    encrypt: true,
    trustServerCertificate: false, // Change to true for local dev / self-signed certs
    rowCollectionOnRequestCompletion: true,
    useUTC: true,
  };

  return config;
}

// Build a tedious config using env vars when available; otherwise use Key Vault
async function buildSqlConfig(context: InvocationContext): Promise<any> {
  // Highest priority: full connection string from env (e.g., SQL_CONNECTION_STRING)
  const envConn = process.env.SQL_CONNECTION_STRING;
  if (envConn) {
    context.log("Using SQL connection string from environment.");
    const cfg = parseConnectionString(envConn, context);
    // Ensure default options
    cfg.options = {
      ...cfg.options,
      encrypt: envBool(process.env.SQL_ENCRYPT, true),
      trustServerCertificate: envBool(process.env.SQL_TRUST_SERVER_CERTIFICATE, false),
      rowCollectionOnRequestCompletion: true,
      useUTC: true,
    };
    return cfg;
  }

  // Next: server/db/user/password from env
  const server = process.env.SQL_SERVER;
  const database = process.env.SQL_DATABASE;
  const user = process.env.SQL_USER;
  const password = process.env.SQL_PASSWORD;
  if (server && database && user && password) {
    context.log("Using discrete SQL settings from environment.");
    return {
      server,
      authentication: {
        type: 'default',
        options: { userName: user, password }
      },
      options: {
        database,
        encrypt: envBool(process.env.SQL_ENCRYPT, true),
        trustServerCertificate: envBool(process.env.SQL_TRUST_SERVER_CERTIFICATE, false),
        rowCollectionOnRequestCompletion: true,
        useUTC: true,
      }
    };
  }

  // Fallback: Key Vault (production/default)
  const kvUri = process.env.KEY_VAULT_URI || "https://helix-keys.vault.azure.net/";
  const passwordSecretName = process.env.SQL_PASSWORD_SECRET_NAME || "sql-databaseserver-password";
  const sqlServer = process.env.SQL_SERVER_FQDN || "helix-database-server.database.windows.net";
  const sqlDatabase = process.env.SQL_DATABASE_NAME || "helix-core-data";
  const sqlUser = process.env.SQL_USER_NAME || "helix-database-server";

  context.log("Using Key Vault to retrieve SQL password.");
  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret(passwordSecretName);
  const kvPassword = passwordSecret.value;

  return {
    server: sqlServer,
    authentication: {
      type: 'default',
      options: { userName: sqlUser, password: kvPassword }
    },
    options: {
      database: sqlDatabase,
      encrypt: true,
      trustServerCertificate: false,
      rowCollectionOnRequestCompletion: true,
      useUTC: true,
    }
  };
}

function envBool(val: string | undefined, def: boolean): boolean {
  if (val === undefined) return def;
  return /^(1|true|yes)$/i.test(val.trim());
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  } as Record<string, string>;
}

export default app;
