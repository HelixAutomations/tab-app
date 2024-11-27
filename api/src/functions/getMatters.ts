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

  let body: RequestBody;

  try {
    body = await req.json() as RequestBody;
    context.log("Request body:", { fullName: body.fullName });
  } catch (error) {
    context.error("Error parsing JSON body:", error);
    return {
      status: 400,
      body: "Invalid JSON format in request body."
    };
  }

  const { fullName } = body;

  if (!fullName) {
    context.warn("Missing 'fullName' in request body.");
    return {
      status: 400,
      body: "Missing 'fullName' in request body."
    };
  }

  try {
    context.log("Initiating SQL query to retrieve matters.");
    const matters = await queryMattersFromSQL(fullName, context);
    context.log("Successfully retrieved matters from SQL database.", { matters });

    return {
      status: 200,
      body: JSON.stringify(matters)
    };
  } catch (error) {
    context.error("Error retrieving matters:", error);
    return {
      status: 500,
      body: "Error retrieving matters."
    };
  } finally {
    context.log("Invocation completed for getMatters Azure Function.");
  }
}

// Register the function
app.http("getMatters", {
  methods: ["POST"],
  authLevel: "function",
  handler: getMattersHandler
});

// Implement the SQL query function
async function queryMattersFromSQL(fullName: string, context: InvocationContext): Promise<MatterData[]> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const sqlDatabase = "helix-core-data";

  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret(passwordSecretName);
  const password = passwordSecret.value;

  const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
  const config = parseConnectionString(connectionString, context);

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

export default app;
