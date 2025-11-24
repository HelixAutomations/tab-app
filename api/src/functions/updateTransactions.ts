// invisible change
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Custom interface for SQL parameters
interface Parameter {
  name: string;
  type: any; // TediousType
  value: any;
}

interface TransactionUpdatePayload {
  transaction_id: string;
  transferRequested: boolean;
  customAmount?: number;
  transferCustom?: boolean;
  user_initials: string;
  matter_ref: string;
  amount: number;
  matterId: string;
}

export async function updateTransactions(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("START: Invocation started for updateTransactions Azure Function.");

  // Handle Asana webhook handshake first
  const hookSecret = req.headers.get("x-hook-secret");
  if (hookSecret) {
    context.log("Asana webhook handshake detected. Echoing X-Hook-Secret header.");
    return {
      status: 200,
      headers: { "X-Hook-Secret": hookSecret },
      body: "Handshake successful."
    };
  }

  // Parse the request payload
  const rawBody: any = await req.json();

  // Handle Asana webhook events
  if (rawBody && rawBody.events) {
    context.log("Received Asana webhook event:", JSON.stringify(rawBody.events));
    context.log("Number of events:", rawBody.events.length); // Debug log

    // Set up SQL connection configuration
    const kvUri = "https://helix-keys.vault.azure.net/";
    const sqlServer = "helix-database-server.database.windows.net";
    const coreDataDb = "helix-core-data";
    context.log("Setting up SQL connection for Asana webhook processing");
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret("sql-databaseserver-password");
    const password = passwordSecret.value || "";
    const coreConfig = {
      server: sqlServer,
      authentication: {
        type: "default",
        options: {
          userName: "helix-database-server",
          password: password,
        },
      },
      options: {
        database: coreDataDb,
        encrypt: true,
        trustServerCertificate: false,
      },
    };

    // Process each event
    for (const event of rawBody.events) {
      context.log("Event resource.resource_type:", event.resource.resource_type); // Fixed debug log
      if (event.resource.resource_type === "task" && event.action === "added" && event.parent?.gid === "1203336124217596") {
        const taskId = typeof event.resource === "object" ? event.resource.gid : event.resource;
        context.log(`Processing Asana event for task ${taskId} in section 1203336124217596`);

        const connection = await connectToSql(coreConfig, context);
        context.log("SQL connection established for task", taskId); // Debug log
        try {
          const updateQuery = `
            UPDATE [dbo].[transactions]
            SET [status] = 'processed'
            WHERE [task_id] = @TaskId
          `;
          const params: Parameter[] = [
            { name: "TaskId", type: TYPES.NVarChar, value: taskId }
          ];
          context.log(`Executing SQL update for task ${taskId} with query: ${updateQuery}`);
          await executeQuery(connection, updateQuery, params, context);
          context.log(`Successfully updated transaction for task ${taskId} to processed.`);
        } catch (err) {
          context.error(`Error updating transaction for task ${taskId}:`, err);
        } finally {
          connection.close();
          context.log(`Closed SQL connection for task ${taskId}`);
        }
      } else {
        context.log("Skipping event:", JSON.stringify(event)); // Debug log for skipped events
      }
    }
    return {
      status: 200,
      body: JSON.stringify({ message: "Asana webhook events processed." })
    };
  }

  // Process TransactionUpdatePayload array
  if (!Array.isArray(rawBody) || !rawBody.every((item: any) => isTransactionUpdatePayload(item, context))) {
    throw new Error("Invalid payload: expected an array of TransactionUpdatePayload objects.");
  }
  const updates: TransactionUpdatePayload[] = rawBody;
  if (updates.length === 0) {
    throw new Error("Empty payload: no updates provided.");
  }
  context.log("SUCCESS: Parsed request payload. Updates:", JSON.stringify(updates));

  const kvUri2 = "https://helix-keys.vault.azure.net/";
  const sqlServer2 = "helix-database-server.database.windows.net";
  const coreDataDb2 = "helix-core-data";
  const projectDataDb = "helix-project-data";

  try {
    context.log("STEP 1: Retrieving SQL password from Key Vault...");
    const secretClient2 = new SecretClient(kvUri2, new DefaultAzureCredential());
    const passwordSecret2 = await secretClient2.getSecret("sql-databaseserver-password");
    const password2 = passwordSecret2.value || "";
    context.log("SUCCESS: Retrieved SQL password from Key Vault.");

    context.log("STEP 3: Setting up database configurations...");
    const projectConfig = {
      server: sqlServer2,
      authentication: {
        type: "default",
        options: {
          userName: "helix-database-server",
          password: password2,
        },
      },
      options: {
        database: projectDataDb,
        encrypt: true,
        trustServerCertificate: false,
      },
    };

    const coreConfig2 = {
      server: sqlServer2,
      authentication: {
        type: "default",
        options: {
          userName: "helix-database-server",
          password: password2,
        },
      },
      options: {
        database: coreDataDb2,
        encrypt: true,
        trustServerCertificate: false,
      },
    };
    context.log("SUCCESS: Database configurations set up.");

    context.log("STEP 4: Processing transaction updates...");
    const results = await Promise.all(
      updates.map((update) => processTransactionUpdate(update, projectConfig, coreConfig2, context))
    );
    context.log("SUCCESS: Processed all transaction updates. Results:", JSON.stringify(results));

    return {
      status: 200,
      body: JSON.stringify(results),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    context.error("ERROR: Error processing transaction updates:", errorMessage);
    if (errorStack) context.error("ERROR STACK:", errorStack);
    return {
      status: 500,
      body: `Error processing transaction updates: ${errorMessage}`,
    };
  } finally {
    context.log("END: Invocation completed for updateTransactions Azure Function.");
  }
}

function isTransactionUpdatePayload(item: any, context: InvocationContext): item is TransactionUpdatePayload {
  const isValid = (
    typeof item === "object" &&
    typeof item.transaction_id === "string" &&
    typeof item.transferRequested === "boolean" &&
    (item.customAmount === undefined || typeof item.customAmount === "number") &&
    (item.transferCustom === undefined || typeof item.transferCustom === "boolean") &&
    typeof item.user_initials === "string" &&
    typeof item.matter_ref === "string" &&
    typeof item.amount === "number" &&
    typeof item.matterId === "string"
  );
  if (!isValid) {
    context.log("Invalid payload item:", item);
  }
  return isValid;
}

async function processTransactionUpdate(
  update: TransactionUpdatePayload,
  projectConfig: any,
  coreConfig: any,
  context: InvocationContext
): Promise<any> {
  const { transaction_id, transferRequested, customAmount, transferCustom, user_initials, matter_ref, amount, matterId } = update;
  const status = transferRequested ? "transfer" : "leave_in_client";

  context.log(`SUB-START: Processing transaction update for transaction_id: ${transaction_id}`);

  const projectConnection = await connectToSql(projectConfig, context);
  const coreConnection = await connectToSql(coreConfig, context);

  try {
    context.log("SUB-STEP 1: Listing tables in helix-core-data database...");
    const tableQuery = `
      SELECT TABLE_SCHEMA, TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
    `;
    const coreTables = await executeQuery(coreConnection, tableQuery, [], context);
    context.log("SUB-STEP 1 SUCCESS: Tables in helix-core-data database:", JSON.stringify(coreTables));

    context.log(`SUB-STEP 2: Updating transaction ${transaction_id} with status: ${status}${customAmount !== undefined ? `, amount: ${customAmount}` : ''}`);
    let query = `
      UPDATE [dbo].[transactions]
      SET [status] = @Status
      WHERE [transaction_id] = @TransactionId
    `;
    const params: Parameter[] = [
      { name: "TransactionId", type: TYPES.NVarChar, value: transaction_id },
      { name: "Status", type: TYPES.NVarChar, value: status },
    ];

    if (transferRequested && customAmount !== undefined) {
      query = `
        UPDATE [dbo].[transactions]
        SET [status] = @Status, [amount] = @CustomAmount
        WHERE [transaction_id] = @TransactionId
      `;
      params.push({ name: "CustomAmount", type: TYPES.Float, value: customAmount });
    }

    context.log(`SUB-STEP 2 QUERY: Executing query: ${query} with params:`, JSON.stringify(params));
    await executeQuery(coreConnection, query, params, context);
    context.log(`SUB-STEP 2 SUCCESS: Successfully updated transaction ${transaction_id}`);

    if (!transferRequested) {
      context.log(`SUB-STEP 3: Skipping Asana task creation for transaction ${transaction_id} (Leave in Client selected).`);
      return { transaction_id, status, customAmount };
    }

    context.log(`SUB-STEP 4: Fetching user details for initials: ${user_initials}`);
    query = `
      SELECT First, ASANAClient_ID, ASANASecret, ASANARefreshToken, ASANAUser_ID, ASANA_ID, ASANATeam_ID, ASANAPending_ID
      FROM team
      WHERE Initials = @UserInitials
    `;
    const userParams: Parameter[] = [
      { name: "UserInitials", type: TYPES.NVarChar, value: user_initials },
    ];
    context.log(`SUB-STEP 4 QUERY: Executing query: ${query} with params:`, JSON.stringify(userParams));
    const userRows = await executeQuery(coreConnection, query, userParams, context);
    if (userRows.length === 0) {
      throw new Error(`User with initials ${user_initials} not found in the team table.`);
    }
    const userFirstName = userRows[0].First;
    const asanaClientId = userRows[0].ASANAClient_ID;
    const asanaSecret = userRows[0].ASANASecret;
    const asanaRefreshToken = userRows[0].ASANARefreshToken;
    const asanaUserId = userRows[0].ASANAUser_ID;
    context.log(`SUB-STEP 4 SUCCESS: Fetched user details: First=${userFirstName}, ASANAUser_ID=${asanaUserId}`);

    const actualAmount = transferCustom && customAmount !== undefined ? customAmount : amount;
    context.log(`SUB-STEP 5: Using actual amount: ${actualAmount}`);

    context.log("SUB-STEP 6: Refreshing Asana token...");
    const encodedRefreshToken = encodeURIComponent(asanaRefreshToken);
    const asanaTokenUrl = `https://app.asana.com/-/oauth_token?grant_type=refresh_token&client_id=${asanaClientId}&client_secret=${asanaSecret}&refresh_token=${encodedRefreshToken}`;
    const tokenResponse = await fetch(asanaTokenUrl, { method: "POST" });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(`Failed to refresh Asana token: ${tokenData.error || tokenResponse.statusText}`);
    }
    const asanaAccessToken = tokenData.access_token;
    context.log("SUB-STEP 6 SUCCESS: Asana token refreshed successfully.");

    context.log("SUB-STEP 7: Creating Asana task...");
    const asanaTaskBody = {
      data: {
        // Keep task title minimal: file/matter reference + transaction type only.
        name: `${matter_ref} - Transfer Request`,
        notes: `Transaction ID: ${transaction_id}\n\nHere are the details of the transfer:\n\nMatter ref: ${matter_ref}\nAmount: £${actualAmount}\nFE: ${userFirstName}`,
        completed: false,
        due_on: "",
        workspace: "1203336123398249",
        projects: ["1203336124217593"],
        assignee: "1203336030510561",
        followers: ["1203336030510561", asanaUserId],
        custom_fields: {
          "1207152520986360": [asanaUserId],
          "1207259656402792": matterId,
          "1207203900011192": "1207259552565194",
        },
      },
    };
    const asanaResponse = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${asanaAccessToken}`,
      },
      body: JSON.stringify(asanaTaskBody),
    });
    const asanaData = await asanaResponse.json();
    if (!asanaResponse.ok || !asanaData.data) {
      throw new Error(`Failed to create Asana task: ${asanaData.error || asanaResponse.statusText}`);
    }
    const asanaTaskId = asanaData.data.gid;
    context.log(`SUB-STEP 7 SUCCESS: Asana task created with ID: ${asanaTaskId}`);

    context.log(`SUB-END: Successfully processed transaction update for transaction_id: ${transaction_id}`);
    return { transaction_id, status, customAmount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    context.error(`SUB-ERROR: Error in processTransactionUpdate for transaction ${transaction_id}:`, errorMessage);
    if (errorStack) context.error("SUB-ERROR STACK:", errorStack);
    throw error;
  } finally {
    projectConnection.close();
    coreConnection.close();
    context.log(`SUB-END: Closed database connections for transaction_id: ${transaction_id}`);
  }
}

async function connectToSql(config: any, context: InvocationContext): Promise<Connection> {
  context.log("Connecting to SQL database:", config.options.database);
  return new Promise((resolve, reject) => {
    const connection = new Connection(config);
    connection.on("connect", (err) => {
      if (err) {
        context.error("Failed to connect to SQL database:", err.message);
        reject(err);
      } else {
        context.log("Successfully connected to SQL database:", config.options.database);
        resolve(connection);
      }
    });
    connection.on("error", (err) => {
      context.error("SQL connection error:", err.message);
      reject(err);
    });
    connection.connect();
  });
}

async function executeQuery(
  connection: Connection,
  query: string,
  params: Parameter[],
  context: InvocationContext
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const request = new SqlRequest(query, (err, rowCount) => {
      if (err) {
        context.error("SQL query execution failed:", err.message);
        reject(new Error(`SQL query execution failed: ${err.message}`));
      } else {
        context.log("SQL query executed successfully, rows affected:", rowCount);
        resolve(rows);
      }
    });
    const rows: any[] = [];
    request.on("row", (columns) => {
      const row: any = {};
      columns.forEach((col) => (row[col.metadata.colName] = col.value));
      rows.push(row);
    });
    request.on("error", (err) => {
      context.error("SQL request error:", err.message);
      reject(new Error(`SQL request error: ${err.message}`));
    });
    params.forEach((param) => request.addParameter(param.name, param.type, param.value));
    connection.execSql(request);
  });
}

export default app.http("updateTransactions", {
  methods: ["POST"],
  authLevel: "function",
  handler: updateTransactions,
});