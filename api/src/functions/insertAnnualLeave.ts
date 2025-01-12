import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for a single date range
interface DateRange {
  start_date: string; // Expected format: "YYYY-MM-DD"
  end_date: string;   // Expected format: "YYYY-MM-DD"
}

// Define the interface for the request body (extended to include days_taken)
interface InsertAnnualLeaveRequest {
  fe: string; // Fee earner initials
  dateRanges: DateRange[]; // One or more date ranges submitted by the form
  reason: string;
  days_taken: number;
  // overlapDetails is included in the JSON payload but not used in the SQL insert yet.
  overlapDetails: any;
}

// Define the interface for the SQL insert result
interface InsertResult {
  success: boolean;
  message: string;
  insertedIds?: number[];
}

/**
 * Handler for the insertAnnualLeave Azure Function.
 * Inserts one or more annual leave entries into SQL.
 */
export async function insertAnnualLeaveHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Invocation started for insertAnnualLeave Azure Function.");

  // Ensure the request method is POST
  if (req.method !== "POST") {
    context.warn(`Unsupported HTTP method: ${req.method}`);
    return {
      status: 405,
      body: "Method Not Allowed. Please use POST.",
    };
  }

  // Parse and validate the request body
  let requestBody: InsertAnnualLeaveRequest;
  try {
    requestBody = await req.json() as InsertAnnualLeaveRequest;
    context.log("Request body:", requestBody);
  } catch (error) {
    context.error("Error parsing JSON body:", error);
    return {
      status: 400,
      body: "Invalid JSON format in request body.",
    };
  }

  const { fe, dateRanges, reason, days_taken } = requestBody;

  if (!fe || !reason || !Array.isArray(dateRanges) || dateRanges.length === 0) {
    context.warn("Missing or invalid 'fe', 'reason', or 'dateRanges' in request body.");
    return {
      status: 400,
      body: "Missing or invalid 'fe', 'reason', or 'dateRanges' in request body.",
    };
  }

  try {
    context.log("Initiating SQL insert operation for Annual Leave entries.");

    // Insert the annual leave entries into SQL
    const insertResult = await insertAnnualLeaveEntries(fe, dateRanges, reason, days_taken, context);
    context.log("Successfully inserted annual leave entries into SQL database.", insertResult);

    return {
      status: 201, // Created
      body: JSON.stringify({
        message: "Annual leave entries created successfully.",
        insertedIds: insertResult.insertedIds,
      }),
    };
  } catch (error) {
    context.error("Error inserting annual leave entries:", error);
    return {
      status: 500,
      body: "Error inserting annual leave entries.",
    };
  } finally {
    context.log("Invocation completed for insertAnnualLeave Azure Function.");
  }
}

/**
 * Inserts one or more annual leave entries into the SQL table.
 *
 * @param fe - The fee earner initials.
 * @param dateRanges - An array of date ranges.
 * @param reason - The reason (notes) for the leave.
 * @param days_taken - Total number of days taken for the leave.
 * @param context - The InvocationContext for logging.
 * @returns A Promise with the insert result.
 */
async function insertAnnualLeaveEntries(
  fe: string,
  dateRanges: DateRange[],
  reason: string,
  days_taken: number,
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

  // Parse SQL connection config using a helper function
  const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
  const config = parseConnectionString(connectionString, context);

  return new Promise<InsertResult>((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error (insertAnnualLeave):", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", async (err) => {
      if (err) {
        context.error("SQL Connection Error (insertAnnualLeave):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Successfully connected to SQL database (insertAnnualLeave).");

      // Define an async helper to insert a single annual leave entry.
      const insertOneEntry = (range: DateRange): Promise<number> => {
        return new Promise<number>((resolveEntry, rejectEntry) => {
          const query = `
            INSERT INTO [dbo].[annualLeave] 
              ([fe], [start_date], [end_date], [reason], [status], [days_taken])
            VALUES 
              (@FE, @StartDate, @EndDate, @Reason, @Status, @DaysTaken);
            SELECT SCOPE_IDENTITY() AS InsertedId;
          `;

          const sqlRequest = new SqlRequest(query, (err, rowCount) => {
            if (err) {
              context.error("SQL Query Execution Error (insertAnnualLeave):", err);
              rejectEntry("SQL query failed.");
              connection.close();
              return;
            }
            context.log(`SQL query executed successfully (insertAnnualLeave). Rows affected: ${rowCount}`);
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
              resolveEntry(insertedId);
            } else {
              rejectEntry("Insert failed: No ID returned.");
            }
          });

          // Bind parameters
          sqlRequest.addParameter("FE", TYPES.NVarChar, fe);
          sqlRequest.addParameter("StartDate", TYPES.Date, range.start_date);
          sqlRequest.addParameter("EndDate", TYPES.Date, range.end_date);
          sqlRequest.addParameter("Reason", TYPES.NVarChar, reason);
          sqlRequest.addParameter("Status", TYPES.NVarChar, "requested");
          sqlRequest.addParameter("DaysTaken", TYPES.Float, days_taken);

          context.log("Executing SQL query with parameters (insertAnnualLeave):", {
            FE: fe,
            StartDate: range.start_date,
            EndDate: range.end_date,
            Reason: reason,
            Status: "requested",
            DaysTaken: days_taken
          });

          connection.execSql(sqlRequest);
        });
      };

      try {
        // Sequentially process each date range and collect inserted IDs
        const insertedIds: number[] = [];
        for (const range of dateRanges) {
          const id = await insertOneEntry(range);
          insertedIds.push(id);
        }

        resolve({
          success: true,
          message: "All annual leave entries inserted successfully.",
          insertedIds,
        });
      } catch (error) {
        reject(error);
      } finally {
        connection.close();
      }
    });

    connection.connect();
  });
}

/**
 * Helper function to parse SQL connection string.
 */
function parseConnectionString(connectionString: string, context: InvocationContext): any {
  const parts = connectionString.split(";");
  const config: any = {};

  parts.forEach(part => {
    const [key, value] = part.split("=");
    if (!key || !value) {
      return;
    }

    switch (key.trim()) {
      case "Server":
        config.server = value;
        break;
      case "Database":
        config.options = { ...config.options, database: value };
        break;
      case "User ID":
        config.authentication = {
          type: "default",
          options: { userName: value, password: "" }
        };
        break;
      case "Password":
        if (!config.authentication) {
          config.authentication = { type: "default", options: { userName: "", password: "" } };
        }
        config.authentication.options.password = value;
        break;
      case "Encrypt":
        config.options = { ...config.options, encrypt: value.toLowerCase() === "true" };
        break;
      case "TrustServerCertificate":
        config.options = { ...config.options, trustServerCertificate: value.toLowerCase() === "true" };
        break;
      case "Connect Timeout":
        config.options = { ...config.options, connectTimeout: parseInt(value, 10) };
        break;
      default:
        break;
    }
  });

  return config;
}

// Export the Azure Function using the Azure Functions app wrapper
export default app.http("insertAnnualLeave", {
  methods: ["POST"],
  authLevel: "function",
  handler: insertAnnualLeaveHandler,
});
