import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Helper function to read and parse the HTTP request body.
// This will handle the cases when the body is already an object, is a string, or is a ReadableStream.
async function getRequestBody(req: HttpRequest): Promise<any> {
  // If req.body is already an object, return it.
  if (req.body && typeof req.body === 'object' && !(req.body as any).getReader) {
    return req.body;
  }
  
  // If the body is a string, try to parse it.
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      throw new Error("Unable to parse request body string as JSON.");
    }
  }
  
  // If the body is a ReadableStream, read it.
  if (req.body && typeof (req.body as any).getReader === 'function') {
    const reader = (req.body as any).getReader();
    let chunks = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks += typeof value === "string" ? value : new TextDecoder().decode(value);
    }
    try {
      return JSON.parse(chunks);
    } catch (err) {
      throw new Error("Unable to parse streamed request body as JSON.");
    }
  }
  
  // Fallback in case nothing matches.
  return {};
}

// Handler for the getAnnualLeave Azure Function
export async function getAnnualLeaveHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("Invocation started for getAnnualLeave Azure Function.");

  const kvUri = "https://helix-keys.vault.azure.net/";
  const passwordSecretName = "sql-databaseserver-password";
  const sqlServer = "helix-database-server.database.windows.net";
  const projectDataDb = "helix-project-data";
  // Removed team table querying per your request

  try {
    // 1) Retrieve SQL password from Azure Key Vault
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value || "";
    context.log("Retrieved SQL password from Key Vault.");

    // 2) Parse SQL connection config for the projectDataDb
    const projectDataConfig = parseConnectionString(
      `Server=${sqlServer};Database=${projectDataDb};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`,
      context
    );

    // 3) Determine today's date
    const todayDate = new Date();
    const todayStr = formatDate(todayDate);
    context.log(`Today's Date: ${todayStr}`);

    // 4) Execute the existing queries for annual_leave and future_leave
    const annualLeaveEntries = await queryAnnualLeave(todayDate, projectDataConfig, context);
    const futureLeaveEntries = await queryFutureLeave(todayDate, projectDataConfig, context);

    // 5) Retrieve the user's initials from the request body.
    const parsedBody = await getRequestBody(req);
    const userInitials = parsedBody && parsedBody.initials ? parsedBody.initials : "";
    context.log("User Initials:", userInitials);

    if (!userInitials) {
      context.log("No initials provided in the request body.");
      return {
        status: 400,
        body: JSON.stringify({ error: "Initials are required in the request body." })
      };
    }

    // 6) Compute the current financial year boundaries.
    //     Financial year: April 1 to March 31.
    let fiscalStart: Date, fiscalEnd: Date;
    const currentMonth = todayDate.getMonth(); // 0-indexed: Jan = 0, Feb = 1, ..., Dec = 11
    if (currentMonth < 3) {
      // For Jan, Feb, Mar the fiscal year started on April 1 of the previous year
      fiscalStart = new Date(todayDate.getFullYear() - 1, 3, 1); // April 1 of previous year
      fiscalEnd = new Date(todayDate.getFullYear(), 2, 31);        // March 31 of current year
    } else {
      // For Apr to Dec, the fiscal year starts this year
      fiscalStart = new Date(todayDate.getFullYear(), 3, 1);       // April 1 of current year
      fiscalEnd = new Date(todayDate.getFullYear() + 1, 2, 31);      // March 31 of next year
    }
    context.log("Fiscal Year Boundaries:", {
      fiscalStart: formatDate(fiscalStart),
      fiscalEnd: formatDate(fiscalEnd)
    });

    // 7) Query the user's annual leave for the current financial year.
    const userDetails = await queryUserAnnualLeave(userInitials, fiscalStart, fiscalEnd, projectDataConfig, context);

    return {
      status: 200,
      body: JSON.stringify({
        annual_leave: annualLeaveEntries,
        future_leave: futureLeaveEntries,
        user_details: userDetails
      })
    };
  } catch (error) {
    context.error("Error retrieving annual leave data:", error);
    return {
      status: 500,
      body: "Error retrieving annual leave data."
    };
  } finally {
    context.log("Invocation completed for getAnnualLeave Azure Function.");
  }
}

// Query for annual leave entries (active leave: today between start_date and end_date)
async function queryAnnualLeave(
  today: Date,
  config: any,
  context: InvocationContext
): Promise<{ 
  person: string; 
  start_date: string; 
  end_date: string; 
  reason: string; 
  status: string; 
  days_taken: number; 
  leave_type: string | null; 
}[]> {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error (AnnualLeave):", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error (AnnualLeave):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Successfully connected to SQL database (AnnualLeave).");

      const query = `
        SELECT 
          [fe] AS person, 
          [start_date], 
          [end_date], 
          [reason], 
          [status], 
          [days_taken], 
          [leave_type]
        FROM [dbo].[annualLeave]
        WHERE 
          @Today BETWEEN [start_date] AND [end_date];
      `;
      context.log("SQL Query (AnnualLeave):", query);

      const sqlRequest = new SqlRequest(query, (err, rowCount) => {
        if (err) {
          context.error("SQL Query Execution Error (AnnualLeave):", err);
          reject("SQL query failed.");
          connection.close();
          return;
        }
        context.log(`SQL query executed successfully (AnnualLeave). Rows returned: ${rowCount}`);
      });

      const annualLeaveList: { 
        person: string; 
        start_date: string; 
        end_date: string; 
        reason: string; 
        status: string; 
        days_taken: number; 
        leave_type: string | null; 
      }[] = [];

      sqlRequest.on("row", (columns) => {
        const entry: any = {};
        columns.forEach((col) => {
          entry[col.metadata.colName] = col.value;
        });

        const formattedStartDate = entry.start_date ? new Date(entry.start_date).toISOString().split('T')[0] : "";
        const formattedEndDate = entry.end_date ? new Date(entry.end_date).toISOString().split('T')[0] : "";

        annualLeaveList.push({
          person: entry.person || "",
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          reason: entry.reason || "",
          status: entry.status || "",
          days_taken: entry.days_taken || 0,
          leave_type: entry.leave_type || null
        });
      });

      sqlRequest.on("requestCompleted", () => {
        context.log("Annual Leave Data Retrieved:", annualLeaveList);
        resolve(annualLeaveList);
        connection.close();
      });

      sqlRequest.addParameter("Today", TYPES.Date, today);
      context.log("Executing SQL query with parameters (AnnualLeave):", { Today: today.toISOString().split('T')[0] });
      connection.execSql(sqlRequest);
    });

    connection.connect();
  });
}

// Query for future leave entries (start_date from today on)
async function queryFutureLeave(
  today: Date,
  config: any,
  context: InvocationContext
): Promise<{ 
  person: string; 
  start_date: string; 
  end_date: string; 
  reason: string; 
  status: string; 
  days_taken: number; 
  leave_type: string | null;
}[]> {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error (FutureLeave):", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error (FutureLeave):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Successfully connected to SQL database (FutureLeave).");

      const query = `
        SELECT 
          [fe] AS person, 
          [start_date], 
          [end_date], 
          [reason], 
          [status], 
          [days_taken], 
          [leave_type]
        FROM [dbo].[annualLeave]
        WHERE 
          [start_date] >= @Today;
      `;
      context.log("SQL Query (FutureLeave):", query);

      const sqlRequest = new SqlRequest(query, (err, rowCount) => {
        if (err) {
          context.error("SQL Query Execution Error (FutureLeave):", err);
          reject("SQL query failed.");
          connection.close();
          return;
        }
        context.log(`SQL query executed successfully (FutureLeave). Rows returned: ${rowCount}`);
      });

      const futureLeaveList: { 
        person: string; 
        start_date: string; 
        end_date: string; 
        reason: string; 
        status: string; 
        days_taken: number; 
        leave_type: string | null;
      }[] = [];

      sqlRequest.on("row", (columns) => {
        const entry: any = {};
        columns.forEach((col) => {
          entry[col.metadata.colName] = col.value;
        });

        const formattedStartDate = entry.start_date ? new Date(entry.start_date).toISOString().split('T')[0] : "";
        const formattedEndDate = entry.end_date ? new Date(entry.end_date).toISOString().split('T')[0] : "";

        futureLeaveList.push({
          person: entry.person || "",
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          reason: entry.reason || "",
          status: entry.status || "",
          days_taken: entry.days_taken || 0,
          leave_type: entry.leave_type || null
        });
      });

      sqlRequest.on("requestCompleted", () => {
        context.log("Future Leave Data Retrieved:", futureLeaveList);
        resolve(futureLeaveList);
        connection.close();
      });

      sqlRequest.addParameter("Today", TYPES.Date, today);
      context.log("Executing SQL query with parameters (FutureLeave):", { Today: today.toISOString().split('T')[0] });
      connection.execSql(sqlRequest);
    });

    connection.connect();
  });
}

// Query for the user's annual leave during the current financial year (April 1–March 31)
// and compute aggregated totals for each leave type.
async function queryUserAnnualLeave(
  initials: string,
  fiscalStart: Date,
  fiscalEnd: Date,
  config: any,
  context: InvocationContext
): Promise<{
  leaveEntries: {
    person: string;
    start_date: string;
    end_date: string;
    reason: string;
    status: string;
    days_taken: number;
    leave_type: string | null;
  }[];
  totals: {
    standard: number;
    unpaid: number;
    purchase: number;
  };
}> {
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);

    connection.on("error", (err) => {
      context.error("SQL Connection Error (UserAnnualLeave):", err);
      reject("An error occurred with the SQL connection.");
    });

    connection.on("connect", (err) => {
      if (err) {
        context.error("SQL Connection Error (UserAnnualLeave):", err);
        reject("Failed to connect to SQL database.");
        return;
      }

      context.log("Connected to SQL database (UserAnnualLeave).");

      const query = `
        SELECT 
          [fe] AS person,
          [start_date],
          [end_date],
          [reason],
          [status],
          [days_taken],
          [leave_type]
        FROM [dbo].[annualLeave]
        WHERE [fe] = @Initials
          AND [start_date] >= @FiscalStart
          AND [start_date] <= @FiscalEnd;
      `;
      context.log("SQL Query (UserAnnualLeave):", query);

      const sqlRequest = new SqlRequest(query, (err, rowCount) => {
        if (err) {
          context.error("SQL Query Execution Error (UserAnnualLeave):", err);
          reject("SQL query failed.");
          connection.close();
          return;
        }
        context.log(`SQL query executed successfully (UserAnnualLeave). Rows returned: ${rowCount}`);
      });

      const leaveEntries: {
        person: string;
        start_date: string;
        end_date: string;
        reason: string;
        status: string;
        days_taken: number;
        leave_type: string | null;
      }[] = [];

      sqlRequest.on("row", (columns) => {
        const entry: any = {};
        columns.forEach((col) => {
          entry[col.metadata.colName] = col.value;
        });

        const formattedStartDate = entry.start_date ? new Date(entry.start_date).toISOString().split('T')[0] : "";
        const formattedEndDate = entry.end_date ? new Date(entry.end_date).toISOString().split('T')[0] : "";

        leaveEntries.push({
          person: entry.person || "",
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          reason: entry.reason || "",
          status: entry.status || "",
          days_taken: entry.days_taken || 0,
          leave_type: entry.leave_type || null
        });
      });

      sqlRequest.on("requestCompleted", () => {
        context.log("User Annual Leave Data Retrieved:", leaveEntries);

        // Compute aggregates for each leave type
        let total_standard = 0,
          total_unpaid = 0,
          total_purchase = 0;
        leaveEntries.forEach(entry => {
          if (entry.leave_type && typeof entry.days_taken === "number") {
            const lt = entry.leave_type.toLowerCase();
            if (lt === "standard") {
              total_standard += entry.days_taken;
            } else if (lt === "unpaid") {
              total_unpaid += entry.days_taken;
            } else if (lt === "purchase") {
              total_purchase += entry.days_taken;
            }
          }
        });

        resolve({
          leaveEntries,
          totals: {
            standard: total_standard,
            unpaid: total_unpaid,
            purchase: total_purchase
          }
        });
        connection.close();
      });

      sqlRequest.addParameter("Initials", TYPES.NVarChar, initials);
      sqlRequest.addParameter("FiscalStart", TYPES.Date, fiscalStart);
      sqlRequest.addParameter("FiscalEnd", TYPES.Date, fiscalEnd);

      context.log("Executing SQL query with parameters (UserAnnualLeave):", {
        Initials: initials,
        FiscalStart: formatDate(fiscalStart),
        FiscalEnd: formatDate(fiscalEnd)
      });
      
      connection.execSql(sqlRequest);
    });

    connection.connect();
  });
}

// Utility function to parse connection string
function parseConnectionString(connectionString: string, context: InvocationContext): any {
  const parts = connectionString.split(";");
  const config: any = {};

  parts.forEach((part) => {
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
        config.authentication = { type: "default", options: { userName: value, password: "" } };
        break;
      case "Password":
        if (!config.authentication) {
          config.authentication = { type: "default", options: { userName: "", password: "" } };
        }
        config.authentication.options.password = value;
        break;
      case "Encrypt":
        config.options = { ...config.options, encrypt: value.toLowerCase() === 'true' };
        break;
      case "TrustServerCertificate":
        config.options = { ...config.options, trustServerCertificate: value.toLowerCase() === 'true' };
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

// Utility function to format a Date object as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (`0${(date.getMonth() + 1)}`).slice(-2);
  const day = (`0${date.getDate()}`).slice(-2);
  return `${year}-${month}-${day}`;
}

// Export the Azure Function
export default app.http("getAnnualLeave", {
  methods: ["GET", "POST"],
  authLevel: "function",
  handler: getAnnualLeaveHandler,
});
