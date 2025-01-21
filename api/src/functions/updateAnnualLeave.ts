import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

/** 
 * This interface matches the body we'll receive from the front-end 
 * OR what's passed into the named function from your React code.
 */
export interface UpdateAnnualLeaveRequest {
  id: string;        // the record ID in the [annualLeave] table
  newStatus: string; // e.g. 'requested', 'approved', 'booked', 'rejected'
  reason?: string;   // optional - for rejections or notes
}

/**
 * Named export: allows your front-end code to call UpdateAnnualLeave(...) directly,
 * bypassing the Azure Function HTTP endpoint if you prefer. 
 *
 * Typically, in a React front-end you'd still POST to the Azure Function URL.
 * But if you want to directly reuse the DB logic, you can do so here.
 */
export async function UpdateAnnualLeave(
  leaveId: string,
  newStatus: string,
  reason: string | null = null
): Promise<void> {
  // Build the payload that matches what the Azure Function's handler expects
  const payload: UpdateAnnualLeaveRequest = { 
    id: leaveId, 
    newStatus, 
    reason: reason || '' 
  };

  // Construct your environment-based URL (the Azure Function endpoint)
  // The below environment variables are placeholders — adjust as needed
  const url = `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_UPDATE_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_UPDATE_ANNUAL_LEAVE_CODE}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `UpdateAnnualLeave failed with status ${response.status}: ${response.statusText}`
    );
  }

  // Optionally parse the JSON if your Azure Function returns a body
  const result = await response.json();
  console.log("UpdateAnnualLeave success:", result);
}

/**
 * Azure Function Handler (default export):
 * 1) Reads a JSON body with { id, newStatus, reason? }
 * 2) Connects to SQL
 * 3) Updates the record if it exists
 * 4) Returns success or error
 */
export async function updateAnnualLeaveHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Invoked updateAnnualLeave Azure Function.");

  if (req.method !== "POST") {
    return {
      status: 405,
      body: "Method Not Allowed. Please use POST.",
    };
  }

  // Parse the request body
  let body: UpdateAnnualLeaveRequest;
  try {
    body = (await req.json()) as UpdateAnnualLeaveRequest;
    context.log("Request body:", body);
  } catch (error) {
    context.error("Invalid JSON body:", error);
    return { status: 400, body: "Invalid JSON body." };
  }

  const { id, newStatus, reason } = body;
  if (!id || !newStatus) {
    return {
      status: 400,
      body: "Missing 'id' or 'newStatus' in request body.",
    };
  }

  try {
    // Perform the actual update in SQL
    const rowsAffected = await updateAnnualLeaveRecord(id, newStatus, reason, context);
    context.log(`Rows affected: ${rowsAffected}`);

    if (rowsAffected === 0) {
      return {
        status: 404,
        body: `No record found or the status cannot be changed to '${newStatus}'.`,
      };
    }

    return {
      status: 200,
      body: JSON.stringify({
        message: `Annual leave ID ${id} updated to status '${newStatus}'.`,
      }),
    };
  } catch (error: any) {
    context.error("Error updating annual leave:", error);
    return {
      status: 500,
      body: `Error updating annual leave: ${error.message || error}`,
    };
  }
}

/**
 * The core SQL logic to update the record in [annualLeave].
 * If you only want to allow certain transitions (e.g., requested->approved, approved->booked),
 * you can enforce that in the WHERE clause or via an IF statement.
 */
async function updateAnnualLeaveRecord(
  id: string,
  newStatus: string,
  reason: string | undefined,
  context: InvocationContext
): Promise<number> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const sqlDatabase = "helix-project-data"; // Adjust if necessary

  // Retrieve SQL password from Key Vault
  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret(passwordSecretName);
  const password = passwordSecret.value || "";

  context.log("Retrieved SQL password from Key Vault for updateAnnualLeave.");

  const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
  const config = parseConnectionString(connectionString);

  return new Promise<number>((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error:", err);
      reject(err);
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error on connect:", err);
        reject(err);
        return;
      }

      context.log("Connected to SQL. Updating annual leave record...");

      // Updated SQL to reference the correct column [request_id]
      const query = `
        UPDATE [dbo].[annualLeave]
           SET [status] = @NewStatus,
               [reason] = CASE WHEN @Reason IS NULL OR @Reason = '' THEN [reason] ELSE @Reason END
         WHERE [request_id] = @ID;
      `;

      const request = new SqlRequest(query, (sqlErr, rowCount) => {
        if (sqlErr) {
          context.error("SQL query error:", sqlErr);
          connection.close();
          reject(sqlErr);
          return;
        }
        connection.close();
        resolve(rowCount);
      });

      // Bind parameters
      request.addParameter("ID", TYPES.Int, parseInt(id, 10));
      request.addParameter("NewStatus", TYPES.NVarChar, newStatus);
      request.addParameter("Reason", TYPES.NVarChar, reason || "");

      context.log("Executing SQL query with parameters:", {
        ID: id,
        NewStatus: newStatus,
        Reason: reason,
      });

      connection.execSql(request);
    });

    connection.connect();
  });
}

function parseConnectionString(connectionString: string): any {
  const parts = connectionString.split(";");
  const config: any = { options: {} };

  parts.forEach((part) => {
    const [key, value] = part.split("=");
    if (!key || !value) return;

    switch (key.trim()) {
      case "Server":
        config.server = value;
        break;
      case "Database":
        config.options.database = value;
        break;
      case "User ID":
        config.authentication = {
          type: "default",
          options: { userName: value, password: "" },
        };
        break;
      case "Password":
        if (!config.authentication) {
          config.authentication = {
            type: "default",
            options: { userName: "", password: "" },
          };
        }
        config.authentication.options.password = value;
        break;
      case "Encrypt":
        config.options.encrypt = value.toLowerCase() === "true";
        break;
      case "TrustServerCertificate":
        config.options.trustServerCertificate = value.toLowerCase() === "true";
        break;
      case "Connect Timeout":
        config.options.connectTimeout = parseInt(value, 10);
        break;
      default:
        // ignore
        break;
    }
  });

  return config;
}

/**
 * The default export is the Azure Function, 
 * so Azure recognizes this file as an HTTP-trigger function.
 */
export default app.http("updateAnnualLeave", {
  methods: ["POST"],
  authLevel: "function",
  handler: updateAnnualLeaveHandler,
});
