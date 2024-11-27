// src/functions/getUserData.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface RequestBody {
    userObjectId: string;
}

// Define the interface for the SQL query result (optional, based on your table structure)
interface TeamData {
    [key: string]: any;
}

// Define the handler function separately
export async function getUserDataHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getUserData Azure Function.");

    // Log incoming request details
    context.log("Request Details:", {
        method: req.method,
        url: req.url,
        headers: req.headers,
        // Avoid logging the body directly as it may contain sensitive information
        // Instead, log that the body has been received
        bodyReceived: !!req.body
    });

    let body: RequestBody;

    try {
        context.log("Attempting to parse JSON body from the request.");
        body = await req.json() as RequestBody;
        context.log("Successfully parsed JSON body:", { userObjectId: body.userObjectId });
    } catch (error) {
        context.error("Error parsing JSON body:", error);
        return {
            status: 400,
            body: "Invalid JSON format in request body."
        };
    }

    const { userObjectId } = body;

    if (!userObjectId) {
        context.warn("Missing 'userObjectId' in request body.");
        return {
            status: 400,
            body: "Missing 'userObjectId' in request body."
        };
    }

    context.log(`Received userObjectId: ${userObjectId}`);

    try {
        context.log("Initiating SQL query to retrieve user data.");
        const userData = await queryUserDataFromSQL(userObjectId, context);
        context.log("Successfully retrieved user data from SQL database.", { userData });

        return {
            status: 200,
            body: JSON.stringify(userData)
        };
    } catch (error) {
        context.error("Error retrieving user data:", error);
        return {
            status: 500,
            body: "Error retrieving user data."
        };
    } finally {
        context.log("Invocation completed for getUserData Azure Function.");
    }
}

// Register the function at the top level
app.http("getUserData", {
    methods: ["POST"],
    authLevel: "function",
    handler: getUserDataHandler
});

// Implement the SQL query function
async function queryUserDataFromSQL(userObjectId: string, context: InvocationContext): Promise<TeamData[]> {
    context.log("Starting SQL query process for userObjectId:", userObjectId);

    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";

    context.log("Initializing SecretClient for Azure Key Vault with URI:", kvUri);
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());

    try {
        context.log(`Retrieving secret '${passwordSecretName}' from Key Vault.`);
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value;
        context.log("Successfully retrieved SQL password from Key Vault.");

        const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
        context.log("Constructed SQL connection string (excluding sensitive information).");

        const config = parseConnectionString(connectionString, context);
        context.log("Parsed SQL connection configuration:", config);

        return new Promise<TeamData[]>((resolve, reject) => {
            context.log("Establishing connection to SQL database.");
            const connection = new Connection(config);

            // Event listener for connection errors
            connection.on("error", (err) => {
                context.error("SQL Connection Event Error:", err);
                reject("An error occurred with the SQL connection.");
            });

            // Event listener for successful connection
            connection.on("connect", (err) => {
                if (err) {
                    context.error("SQL Connection Error:", err);
                    reject("Failed to connect to SQL database.");
                    return;
                }

                context.log("Successfully connected to SQL database.");

                const query = `SELECT * FROM team WHERE [Entra ID] = @userObjectId`;
                context.log("Preparing SQL query:", query);

                const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                    if (err) {
                        context.error("SQL Query Execution Error:", err);
                        reject("SQL query failed.");
                        connection.close();
                        return;
                    }

                    context.log(`SQL query executed successfully. Rows returned: ${rowCount}`);
                    // No action needed here since rows are collected via 'row' events
                });

                const result: TeamData[] = [];

                // Collect rows from the 'row' event
                sqlRequest.on('row', (columns) => {
                    const obj: TeamData = {};
                    columns.forEach((column: { metadata: { colName: string }, value: any }) => {
                        obj[column.metadata.colName] = column.value;
                    });
                    result.push(obj);
                });

                // Handle completion of the request
                sqlRequest.on('requestCompleted', () => {
                    context.log("SQL query result transformed:", result);
                    resolve(result);
                    connection.close();
                    context.log("SQL connection closed after successful query.");
                });

                // Handle errors during the request
                sqlRequest.on('error', (err) => {
                    context.error("SQL Query Error:", err);
                    reject("SQL query failed.");
                    connection.close();
                });

                // Add parameters to prevent SQL injection
                context.log("Adding parameters to SQL request.");
                sqlRequest.addParameter('userObjectId', TYPES.NVarChar, userObjectId);

                context.log("Executing SQL query.");
                connection.execSql(sqlRequest);
            });

            connection.connect();
            context.log("SQL connection initiated.");
        });
    } catch (error) {
        context.error("Error during SQL query process:", error);
        throw error;
    }
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString: string, context: InvocationContext): any {
    context.log("Parsing SQL connection string.");
    const parts = connectionString.split(';');
    const config: any = {};

    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (!key || !value) {
            context.warn(`Invalid connection string part encountered: '${part}'`);
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
                    options: {
                        userName: value,
                        password: '' // Password is set separately
                    }
                };
                break;
            case 'Password':
                if (!config.authentication) {
                    config.authentication = { type: 'default', options: { userName: '', password: '' } };
                }
                config.authentication.options.password = value;
                break;
            default:
                context.warn(`Unknown connection string key encountered: '${key}'`);
                break;
        }
    });

    context.log("SQL connection configuration parsed successfully:", config);
    return config;
}

export default app;
