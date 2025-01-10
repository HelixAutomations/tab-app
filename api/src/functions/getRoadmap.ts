// src/functions/getRoadmap.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the SQL data
interface RoadmapEntry {
  id: number;
  requested_by: string;
  date_requested: string; // ISO date string
  component: string;
  label: string;
  description: string;
  status: string;
}

// Define the interface for the SQL fetch result
interface FetchResult {
  success: boolean;
  message: string;
  data?: RoadmapEntry[];
}

// Handler for the getRoadmap Azure Function
export async function getRoadmapHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Invocation started for getRoadmap Azure Function.");

  // Ensure the request method is GET
  if (req.method !== "GET") {
    context.warn(`Unsupported HTTP method: ${req.method}`);
    return {
      status: 405,
      body: "Method Not Allowed. Please use GET.",
    };
  }

  try {
    context.log("Initiating SQL fetch operation.");

    // Fetch the roadmap entries from SQL
    const fetchResult = await fetchRoadmapEntries(context);
    context.log("Successfully fetched roadmap entries from SQL database.", fetchResult);

    return {
      status: 200, // OK
      body: JSON.stringify({
        message: "Roadmap entries retrieved successfully.",
        data: fetchResult.data,
      }),
    };
  } catch (error: any) {
    context.error("Error fetching roadmap entries:", error);
    return {
      status: 500,
      body: JSON.stringify({
        success: false,
        message: "Error fetching roadmap entries.",
      }),
    };
  } finally {
    context.log("Invocation completed for getRoadmap Azure Function.");
  }
}

// Function to fetch all roadmap entries from the SQL table
async function fetchRoadmapEntries(
  context: InvocationContext
): Promise<FetchResult> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const sqlDatabase = "helix-project-data"; // Adjust if necessary

  try {
    // Retrieve SQL password from Azure Key Vault
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value || "";
    context.log("Retrieved SQL password from Key Vault.");

    // Parse SQL connection config
    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
    const config = parseConnectionString(connectionString, context);

    return new Promise<FetchResult>((resolve, reject) => {
      const connection = new Connection(config);
      const entries: RoadmapEntry[] = [];

      connection.on("error", (err) => {
        context.error("SQL Connection Error (fetchRoadmapEntries):", err);
        reject({ success: false, message: "An error occurred with the SQL connection." });
      });

      connection.on("connect", (err) => {
        if (err) {
          context.error("SQL Connection Error (fetchRoadmapEntries):", err);
          reject({ success: false, message: "Failed to connect to SQL database." });
          return;
        }

        context.log("Successfully connected to SQL database (fetchRoadmapEntries).");

        // Updated SQL SELECT query with 'label'
        const query = `
          SELECT 
            [id],
            [requested_by],
            [date_requested],
            [component],
            [label],
            [description],
            [status]
          FROM 
            [dbo].[teamHubRoadmap];
        `;

        context.log("SQL Query (fetchRoadmapEntries):", query);

        const sqlRequest = new SqlRequest(query, (err, rowCount) => {
          if (err) {
            context.error("SQL Query Execution Error (fetchRoadmapEntries):", err);
            reject({ success: false, message: "SQL query failed." });
            connection.close();
            return;
          }

          context.log(`SQL query executed successfully (fetchRoadmapEntries). Rows returned: ${rowCount}`);
        });

        sqlRequest.on("row", (columns) => {
          const entry: RoadmapEntry = {
            id: columns.find(c => c.metadata.colName === "id")?.value as number,
            requested_by: columns.find(c => c.metadata.colName === "requested_by")?.value as string || "Unknown",
            date_requested: columns.find(c => c.metadata.colName === "date_requested")?.value as string || new Date().toISOString(),
            component: columns.find(c => c.metadata.colName === "component")?.value as string || "Unknown",
            label: columns.find(c => c.metadata.colName === "label")?.value as string || "No Label",
            description: columns.find(c => c.metadata.colName === "description")?.value as string || "",
            status: columns.find(c => c.metadata.colName === "status")?.value as string || "Unknown",
          };
          entries.push(entry);
        });

        sqlRequest.on("requestCompleted", () => {
          resolve({
            success: true,
            message: "Fetch successful.",
            data: entries,
          });
          connection.close();
        });

        context.log("Executing SQL query (fetchRoadmapEntries).");
        connection.execSql(sqlRequest);
      });

      connection.connect();
    });
  } catch (error: any) {
    context.error("Error during fetchRoadmapEntries:", error);
    return { success: false, message: "Failed to fetch roadmap entries." };
  }
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString: string, context: InvocationContext): any {
  const parts = connectionString.split(";");
  const config: any = {
    options: {},
  };

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
        config.options.database = value;
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
        config.options.encrypt = value.toLowerCase() === 'true';
        break;
      case 'TrustServerCertificate':
        config.options.trustServerCertificate = value.toLowerCase() === 'true';
        break;
      default:
        break;
    }
  });

  return config;
}

// Export the Azure Function
export default app.http("getRoadmap", {
  methods: ["GET"],
  authLevel: "function",
  handler: getRoadmapHandler,
});
