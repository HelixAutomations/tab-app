// src/functions/insertBookSpace.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface InsertBookSpaceRequest {
  fee_earner: string;
  booking_date: string;  // 'YYYY-MM-DD'
  booking_time: string;  // Expected "HH:MM:SS" or with fraction
  duration: number;
  reason: string;
  spaceType: "Boardroom" | "Soundproof Pod";
}

// Define the interface for the SQL insert result
interface InsertResult {
  success: boolean;
  message: string;
  insertedId?: number;
}

export async function insertBookSpaceHandler(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("insertBookSpaceHandler invoked.");

  if (req.method !== "POST") {
    context.warn(`Unsupported HTTP method: ${req.method}`);
    return { status: 405, body: "Method Not Allowed. Please use POST." };
  }

  let requestBody: InsertBookSpaceRequest;
  try {
    requestBody = await req.json() as InsertBookSpaceRequest;
    context.log("Request body:", requestBody);
  } catch (error) {
    context.error("Error parsing JSON body:", error);
    return { status: 400, body: "Invalid JSON format in request body." };
  }

  const { fee_earner, booking_date, booking_time, duration, reason, spaceType } = requestBody;

  if (!fee_earner || !booking_date || !booking_time || !duration || !reason || !spaceType) {
    context.warn("Missing required booking fields in request body.");
    return { status: 400, body: "Missing required booking fields." };
  }

  try {
    context.log("Initiating SQL insert operation for booking.");
    const insertResult = await insertBookSpaceEntry(
      fee_earner,
      booking_date,
      booking_time,
      duration,
      reason,
      spaceType,
      context
    );
    context.log("Successfully inserted booking entry.", insertResult);
    return {
      status: 201,
      body: JSON.stringify({
        message: "Booking created successfully.",
        insertedId: insertResult.insertedId,
      }),
    };
  } catch (error) {
    context.error("Error inserting booking entry:", error);
    return { status: 500, body: "Error inserting booking entry." };
  } finally {
    context.log("insertBookSpaceHandler invocation completed.");
  }
}

async function insertBookSpaceEntry(
  fee_earner: string,
  booking_date: string,
  booking_time: string,
  duration: number,
  reason: string,
  spaceType: "Boardroom" | "Soundproof Pod",
  context: InvocationContext
): Promise<InsertResult> {
  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const sqlDatabase = "helix-project-data"; // Adjust if necessary

  const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret(passwordSecretName);
  const password = passwordSecret.value || "";
  context.log("Retrieved SQL password from Key Vault.");

  const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
  const config = parseConnectionString(connectionString, context);
  const tableName = spaceType === "Boardroom" ? "boardroom_bookings" : "soundproofpod_bookings";

  return new Promise<InsertResult>((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error (insertBookSpace):", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error (insertBookSpace):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Connected to SQL database (insertBookSpace).");

      const query = `
        INSERT INTO [dbo].[${tableName}]
          ([fee_earner], [booking_date], [booking_time], [duration], [reason], [created_at], [updated_at])
        VALUES
          (@FeeEarner, @BookingDate, @BookingTime, @Duration, @Reason, GETDATE(), GETDATE());
        SELECT SCOPE_IDENTITY() AS InsertedId;
      `;
      context.log("SQL Query (insertBookSpace):", query);

      const sqlRequest = new SqlRequest(query, (err, rowCount) => {
        if (err) {
          context.error("SQL Query Execution Error (insertBookSpace):", err);
          reject("SQL query failed.");
          connection.close();
          return;
        }
        context.log(`SQL query executed successfully. Rows returned: ${rowCount}`);
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

      // Log the booking_time parameter before binding.
      context.log("Binding parameters for BookingTime:", booking_time);

      // Convert the booking_time string into a Date object using an arbitrary date.
      const bookingTimeValue = new Date(`1970-01-01T${booking_time}Z`);
      // *** KEY FIX: Pass a Date object for BookingTime to satisfy TIME(7) validation ***
      sqlRequest.addParameter("FeeEarner", TYPES.NVarChar, fee_earner);
      sqlRequest.addParameter("BookingDate", TYPES.Date, booking_date);
      sqlRequest.addParameter("BookingTime", TYPES.Time, bookingTimeValue, { scale: 7 });
      sqlRequest.addParameter("Duration", TYPES.Decimal, duration);
      sqlRequest.addParameter("Reason", TYPES.NVarChar, reason);

      context.log("Executing SQL request with parameters:", {
        FeeEarner: fee_earner,
        BookingDate: booking_date,
        BookingTime: booking_time,
        Duration: duration,
        Reason: reason,
      });

      connection.execSql(sqlRequest);
    });

    connection.connect();
  });
}

function parseConnectionString(connectionString: string, context: InvocationContext): any {
  const parts = connectionString.split(";");
  const config: any = {};
  parts.forEach(part => {
    const [key, value] = part.split("=");
    if (!key || !value) return;
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

export default app.http("insertBookSpace", {
  methods: ["POST"],
  authLevel: "function",
  handler: insertBookSpaceHandler,
});
