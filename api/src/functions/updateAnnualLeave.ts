// src/functions/updateAnnualLeave.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";
import axios from 'axios';

/** 
 * This interface matches the body we'll receive from the front-end 
 * OR what's passed into the named function from your React code.
 */
export interface UpdateAnnualLeaveRequest {
  id: string;               // The record ID in the [annualLeave] table
  newStatus: string;        // e.g., 'requested', 'approved', 'booked', 'rejected'
  rejection_notes?: string; // Optional - for rejections
}

interface AnnualLeaveRecord {
  fe: string;
  start_date: string; // "YYYY-MM-DD" or ISO string
  end_date: string;   // "YYYY-MM-DD" or ISO string
  // Add other fields if necessary
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
  rejectionNotes: string | null = null // Renamed parameter
): Promise<void> {
  // Build the payload that matches the updated Azure Function's handler
  const payload: UpdateAnnualLeaveRequest = { 
    id: leaveId, 
    newStatus, 
    rejection_notes: rejectionNotes || '' // Map to rejection_notes
  };

  // Construct your environment-based URL (the Azure Function endpoint)
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
 * 1) Reads a JSON body with { id, newStatus, rejection_notes? }
 * 2) Connects to SQL
 * 3) Updates the record if it exists
 * 4) Creates a Clio calendar entry if newStatus is 'booked'
 * 5) Returns success or error
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

  const { id, newStatus, rejection_notes } = body;
  if (!id || !newStatus) {
    return {
      status: 400,
      body: "Missing 'id' or 'newStatus' in request body.",
    };
  }

  // Optional: Validate newStatus
  const allowedStatuses = ['requested', 'approved', 'booked', 'rejected', 'acknowledged', 'discarded'];
  if (!allowedStatuses.includes(newStatus.toLowerCase())) {
    return {
      status: 400,
      body: `Invalid 'newStatus'. Allowed statuses are: ${allowedStatuses.join(', ')}.`,
    };
  }

  try {
    // Perform the actual update in SQL
    const rowsAffected = await updateAnnualLeaveRecord(id, newStatus, rejection_notes, context);
    context.log(`Rows affected: ${rowsAffected}`);

    if (rowsAffected === 0) {
      return {
        status: 404,
        body: `No record found with ID ${id}, or the status transition is invalid.`,
      };
    }

    // If newStatus is 'booked', proceed to create Clio calendar entry
    if (newStatus.toLowerCase() === 'booked') {
      // Fetch the updated annual leave record to get necessary details
      const leaveRecord = await fetchAnnualLeaveRecord(id, context);
      if (!leaveRecord) {
        context.warn(`Annual leave record with ID ${id} not found for Clio integration.`);
        return {
          status: 200,
          body: JSON.stringify({
            message: `Annual leave ID ${id} updated to status '${newStatus}', but failed to fetch record for Clio integration.`,
          }),
        };
      }

      // Fetch Clio secrets from Azure Key Vault
      const clioSecrets = await fetchClioSecrets(context);
      if (!clioSecrets) {
        context.error("Failed to retrieve Clio secrets from Key Vault.");
        return {
          status: 500,
          body: "Internal server error: Unable to retrieve Clio secrets.",
        };
      }

      // Obtain Clio access token
      const accessToken = await getClioAccessToken(clioSecrets, context);
      if (!accessToken) {
        context.error("Failed to obtain Clio access token.");
        return {
          status: 500,
          body: "Internal server error: Unable to obtain Clio access token.",
        };
      }

      // Create Clio calendar entry
      try {
        const clioEntryId = await createClioCalendarEntry(
          accessToken,
          leaveRecord.fe,
          leaveRecord.start_date,
          leaveRecord.end_date,
          context
        );

        context.log(`Successfully created Clio calendar entry with ID: ${clioEntryId}`);

        // Optionally, update the SQL record with the Clio entry ID
        // await updateClioEntryId(id, clioEntryId, context);

      } catch (clioError) {
        context.error("Error creating Clio calendar entry:", clioError);
        return {
          status: 500,
          body: "Internal server error: Unable to create Clio calendar entry.",
        };
      }
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
 * Fetches the annual leave record from the database using the provided ID.
 */
async function fetchAnnualLeaveRecord(id: string, context: InvocationContext): Promise<AnnualLeaveRecord | null> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const sqlDatabase = "helix-project-data"; // Adjust if necessary

  // Retrieve SQL password from Key Vault
  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret(passwordSecretName);
  const password = passwordSecret.value || "";

  context.log("Retrieved SQL password from Key Vault for fetching annual leave record.");

  const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
  const config = parseConnectionString(connectionString);

  return new Promise<AnnualLeaveRecord | null>((resolve, reject) => {
    const connection = new Connection(config);

    let record: AnnualLeaveRecord | null = null;

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error (fetchAnnualLeaveRecord):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Connected to SQL database (fetchAnnualLeaveRecord).");

      const query = `
        SELECT fe, start_date, end_date
        FROM [dbo].[annualLeave]
        WHERE request_id = @ID
      `;

      const request = new SqlRequest(query, (sqlErr, rowCount) => {
        if (sqlErr) {
          context.error("SQL Query Error (fetchAnnualLeaveRecord):", sqlErr);
          connection.close();
          reject("SQL query failed.");
          return;
        }

        connection.close();
        resolve(record);
      });

      // Bind parameters
      request.addParameter("ID", TYPES.Int, parseInt(id, 10));

      request.on("row", (columns) => {
        record = {
          fe: columns.find(c => c.metadata.colName === "fe")?.value as string,
          start_date: columns.find(c => c.metadata.colName === "start_date")?.value as string,
          end_date: columns.find(c => c.metadata.colName === "end_date")?.value as string,
        };
      });

      connection.execSql(request);
    });

    connection.on("error", (err) => {
      context.error("SQL Connection Error (fetchAnnualLeaveRecord):", err);
      reject("SQL connection error.");
    });

    connection.connect();
  });
}

/**
 * Fetches Clio-related secrets from Azure Key Vault.
 */
async function fetchClioSecrets(context: InvocationContext): Promise<{ clientId: string, clientSecret: string, refreshToken: string } | null> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  
  const clientIdSecretName = "clio-calendars-clientid";
  const clientSecretName = "clio-calendars-secret";
  const refreshTokenSecretName = "clio-calendars-refreshtoken";

  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());

  try {
    const [clientIdSecret, clientSecret, refreshTokenSecret] = await Promise.all([
      secretClient.getSecret(clientIdSecretName),
      secretClient.getSecret(clientSecretName),
      secretClient.getSecret(refreshTokenSecretName)
    ]);

    return {
      clientId: clientIdSecret.value || "",
      clientSecret: clientSecret.value || "",
      refreshToken: refreshTokenSecret.value || ""
    };
  } catch (error) {
    context.error("Error fetching Clio secrets from Key Vault:", error);
    return null;
  }
}

/**
 * Obtains Clio access token using the refresh token.
 */
async function getClioAccessToken(clioSecrets: { clientId: string, clientSecret: string, refreshToken: string }, context: InvocationContext): Promise<string | null> {
  const tokenUrl = "https://eu.app.clio.com/oauth/token";

  const data = {
    client_id: clioSecrets.clientId,
    client_secret: clioSecrets.clientSecret,
    grant_type: "refresh_token",
    refresh_token: clioSecrets.refreshToken
  };

  try {
    context.log("Requesting Clio access token with refresh token.");
    const response = await axios.post(tokenUrl, new URLSearchParams(data).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    context.log("Clio access token obtained successfully.");
    return response.data.access_token;
  } catch (error: any) {
    context.error("Error obtaining Clio access token:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Creates a calendar entry in Clio.
 */
async function createClioCalendarEntry(
  accessToken: string,
  fe: string,
  startDate: string, // "YYYY-MM-DD" or ISO string
  endDate: string,   // "YYYY-MM-DD" or ISO string
  context: InvocationContext
): Promise<number> {
  const calendarUrl = "https://eu.app.clio.com/api/v4/calendar_entries.json";
  const calendarId = 152290; // Updated Calendar ID

  const summary = `${fe} A/L`;

  // Validate and parse dates
  const startDateObject = new Date(startDate);
  const endDateObject = new Date(endDate);
  endDateObject.setUTCDate(endDateObject.getUTCDate() + 1); // Make end_at exclusive

  if (isNaN(startDateObject.getTime()) || isNaN(endDateObject.getTime())) {
    context.error("Invalid date format for Clio calendar entry:", { startDate, endDate });
    throw new Error("Invalid date format for Clio calendar entry.");
  }

  // Construct the payload
  const data = {
    data: {
      all_day: true,
      calendar_owner: { id: calendarId },
      start_at: startDateObject.toISOString(),
      end_at: endDateObject.toISOString(),
      summary: summary,
      send_email_notification: false
    }
  };

  try {
    context.log("Creating Clio calendar entry with data:", data);

    const response = await axios.post(calendarUrl, data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (response.status === 201) {
      context.log("Clio calendar entry created successfully:", response.data);
      return parseInt(response.data.data.id, 10);
    } else {
      context.error(`Unexpected status code: ${response.status}`);
      throw new Error(`Failed to create Clio calendar entry. Status: ${response.status}`);
    }
  } catch (error: any) {
    context.error("Error creating Clio calendar entry:", error.response?.data || error.message);
    throw new Error("Failed to create Clio calendar entry.");
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
  rejectionNotes: string | undefined, // Renamed parameter
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
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Connected to SQL. Updating annual leave record...");

      // Update query now sets [rejection_notes] when the status is 'rejected'
      const query = `
        UPDATE [dbo].[annualLeave]
           SET [status] = @NewStatus,
               [rejection_notes] = CASE 
                                     WHEN @NewStatus = 'rejected' AND (@RejectionNotes IS NOT NULL AND @RejectionNotes <> '')
                                     THEN @RejectionNotes 
                                     ELSE [rejection_notes] 
                                   END
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
      request.addParameter("RejectionNotes", TYPES.NVarChar, rejectionNotes || "");

      context.log("Executing SQL query with parameters:", {
        ID: id,
        NewStatus: newStatus,
        RejectionNotes: rejectionNotes,
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
