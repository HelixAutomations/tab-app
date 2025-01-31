// src/functions/getAllMatters.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the SQL query result
export interface MatterData {
  [key: string]: any;
}

// Define the handler function
export async function getAllMattersHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Invocation started for getAllMatters Azure Function.");

  // Ensure the request method is GET
  if (req.method !== "GET") {
    context.warn(`Unsupported HTTP method: ${req.method}. Only GET is allowed.`);
    return {
      status: 405,
      body: "Method Not Allowed. Use GET to retrieve all matters."
    };
  }

  try {
    context.log("Initiating SQL query to retrieve all matters.");
    const matters = await queryAllMattersFromSQL(context);
    context.log("Successfully retrieved all matters from SQL database.", { count: matters.length });

    return {
      status: 200,
      body: JSON.stringify(matters)
    };
  } catch (error) {
    context.error("Error retrieving all matters:", error);
    return {
      status: 500,
      body: "Error retrieving matters."
    };
  } finally {
    context.log("Invocation completed for getAllMatters Azure Function.");
  }
}

// Register the function
app.http("getAllMatters", {
  methods: ["GET"],
  authLevel: "function",
  handler: getAllMattersHandler
});

// Implement the SQL query function
async function queryAllMattersFromSQL(context: InvocationContext): Promise<MatterData[]> {
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

export default app;
