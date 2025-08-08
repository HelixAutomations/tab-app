// invisible change 2
// src/functions/getAllMatters.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";


// Define the interface for the SQL query result
export interface MatterData {
  [key: string]: any;
}


// Define the handler function (now supports GET, POST, OPTIONS, CORS, env config, and parameterized query)
export async function getAllMattersHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Invocation started for getAllMatters Azure Function.");

  // Basic CORS / preflight support for local development and browser calls
  if (req.method === 'OPTIONS') {
    return {
      status: 200,
      headers: corsHeaders(),
      body: ''
    };
  }

  let body: any = undefined;
  try {
    // Accept JSON body (POST) or query string (GET) for convenience in local dev
    if (req.method === 'POST') {
      body = await req.json();
    }
    // No params needed for all matters, but allow for future extension
    context.log("Request params:", { method: req.method });
  } catch (error) {
    context.error("Error parsing JSON body:", error);
    return {
      status: 400,
      headers: corsHeaders(),
      body: "Invalid JSON format in request body."
    };
  }

  try {
    context.log("Initiating SQL query to retrieve all matters.");
    const matters = await queryAllMattersFromSQL(context);
    context.log("Successfully retrieved all matters from SQL database.", { count: matters.length });

    return {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(matters)
    };
  } catch (error) {
    context.error("Error retrieving all matters:", error);
    return {
      status: 500,
      headers: corsHeaders(),
      body: "Error retrieving matters."
    };
  } finally {
    context.log("Invocation completed for getAllMatters Azure Function.");
  }
}


// Register the function
app.http("getAllMatters", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "function",
  handler: getAllMattersHandler
});


// Implement the SQL query function (now supports env var config like getMatters)
async function queryAllMattersFromSQL(context: InvocationContext): Promise<MatterData[]> {
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
        FROM matters;
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
