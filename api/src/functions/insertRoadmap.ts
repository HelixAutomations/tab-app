// src/functions/insertRoadmap.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface InsertRoadmapRequest {
  component: string;
  narrative: string;
  requested_by: string; // Initials from user data
}

// Define the interface for the SQL insert result (optional)
interface InsertResult {
  success: boolean;
  message: string;
  insertedId?: number;
}

// Handler for the insertRoadmap Azure Function
export async function insertRoadmapHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Invocation started for insertRoadmap Azure Function.");

  // Ensure the request method is POST
  if (req.method !== "POST") {
    context.warn(`Unsupported HTTP method: ${req.method}`);
    return {
      status: 405,
      body: "Method Not Allowed. Please use POST.",
    };
  }

  // Parse and validate the request body
  let requestBody: InsertRoadmapRequest;
  try {
    requestBody = await req.json() as InsertRoadmapRequest;
    context.log("Request body:", requestBody);
  } catch (error) {
    context.error("Error parsing JSON body:", error);
    return {
      status: 400,
      body: "Invalid JSON format in request body.",
    };
  }

  const { component, narrative, requested_by } = requestBody;

  if (!component || !narrative || !requested_by) {
    context.warn("Missing 'component', 'narrative', or 'requested_by' in request body.");
    return {
      status: 400,
      body: "Missing 'component', 'narrative', or 'requested_by' in request body.",
    };
  }

  try {
    context.log("Initiating SQL insert operation.");

    // Insert the roadmap entry into SQL
    const insertResult = await insertRoadmapEntry(component, narrative, requested_by, context);
    context.log("Successfully inserted roadmap entry into SQL database.", insertResult);

    return {
      status: 201, // Created
      body: JSON.stringify({
        message: "Roadmap entry created successfully.",
        insertedId: insertResult.insertedId,
      }),
    };
  } catch (error) {
    context.error("Error inserting roadmap entry:", error);
    return {
      status: 500,
      body: "Error inserting roadmap entry.",
    };
  } finally {
    context.log("Invocation completed for insertRoadmap Azure Function.");
  }
}

// Function to insert a roadmap entry into the SQL table
async function insertRoadmapEntry(
  component: string,
  narrative: string,
  requested_by: string,
  context: InvocationContext
): Promise<InsertResult> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const sqlDatabase = "helix-project-data"; // Adjust if necessary

  // Retrieve SQL password from Azure Key Vault
  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret(passwordSecretName);
  const password = passwordSecret.value || "";
  context.log("Retrieved SQL password from Key Vault.");

  // Parse SQL connection config
  const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
  const config = parseConnectionString(connectionString, context);

  return new Promise<InsertResult>((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error (insertRoadmap):", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error (insertRoadmap):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Successfully connected to SQL database (insertRoadmap).");

      // SQL INSERT query
      const query = `
        INSERT INTO [dbo].[teamHubRoadmap] 
          ([requested_by], [date_requested], [component], [narrative], [status])
        VALUES 
          (@RequestedBy, @DateRequested, @Component, @Narrative, @Status);
        SELECT SCOPE_IDENTITY() AS InsertedId;
      `;

      context.log("SQL Query (insertRoadmap):", query);

      const sqlRequest = new SqlRequest(query, (err, rowCount) => {
        if (err) {
          context.error("SQL Query Execution Error (insertRoadmap):", err);
          reject("SQL query failed.");
          connection.close();
          return;
        }

        context.log(`SQL query executed successfully (insertRoadmap). Rows returned: ${rowCount}`);
      });

      let insertedId: number | undefined;

      sqlRequest.on("row", (columns) => {
        const id = columns.find(c => c.metadata.colName === "InsertedId")?.value;
        if (id) {
          insertedId = parseInt(id as string, 10);
        }
      });

      sqlRequest.on("requestCompleted", () => {
        if (insertedId !== undefined) {
          resolve({
            success: true,
            message: "Insert successful.",
            insertedId,
          });
        } else {
          reject("Insert failed: No ID returned.");
        }
        connection.close();
      });

      // Bind parameters
      const today = new Date();
      sqlRequest.addParameter("RequestedBy", TYPES.NVarChar, requested_by);
      sqlRequest.addParameter("DateRequested", TYPES.Date, today.toISOString().split('T')[0]); // YYYY-MM-DD
      sqlRequest.addParameter("Component", TYPES.NVarChar, component);
      sqlRequest.addParameter("Narrative", TYPES.NVarChar, narrative);
      sqlRequest.addParameter("Status", TYPES.NVarChar, "requested");

      context.log("Executing SQL query with parameters (insertRoadmap):", {
        RequestedBy: requested_by,
        DateRequested: today.toISOString().split('T')[0],
        Component: component,
        Narrative: narrative,
        Status: "requested",
      });

      connection.execSql(sqlRequest);
    });

    connection.connect();
  });
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString: string, context: InvocationContext): any {
  const parts = connectionString.split(";");
  const config: any = {};

  parts.forEach(part => {
    const [key, value] = part.split("=");
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
      case 'Encrypt':
        config.options = { ...config.options, encrypt: value.toLowerCase() === 'true' };
        break;
      case 'TrustServerCertificate':
        config.options = { ...config.options, trustServerCertificate: value.toLowerCase() === 'true' };
        break;
      case 'Connect Timeout':
        config.options = { ...config.options, connectTimeout: parseInt(value, 10) };
        break;
      default:
        break;
    }
  });

  return config;
}

// Export the Azure Function
export default app.http("insertRoadmap", {
  methods: ["POST"],
  authLevel: "function",
  handler: insertRoadmapHandler,
});
