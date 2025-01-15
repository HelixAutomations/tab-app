// src/functions/postFinancialTask.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface RequestBody {
    formType: string;
    data: any;
    initials: string;
}

// Define the handler function
export async function postFinancialTaskHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for postFinancialTask Azure Function.");

    try {
        // Parse and validate the request body
        const payload = await req.json() as RequestBody;
        const { formType, data, initials } = payload;

        if (!formType || !data || !initials) {
            context.warn("Missing formType, data, or initials in request body.");
            return {
                status: 400,
                body: JSON.stringify({ error: "Missing formType, data, or initials in the request body." })
            };
        }

        // Fetch ASANA credentials (and the user's ASANA ID) based on the user's initials
        const asanaCredentials = await getAsanaCredentials(initials, context);
        if (!asanaCredentials) {
            context.warn(`ASANA credentials not found for initials: ${initials}`);
            return {
                status: 400,
                body: JSON.stringify({ error: "ASANA credentials not found for the provided initials." })
            };
        }

        const { ASANAClientID, ASANASecret, ASANARefreshToken, ASANAUserID } = asanaCredentials;

        // Refresh the Asana token
        const tokenUrl = `https://app.asana.com/-/oauth_token?grant_type=refresh_token&client_id=${encodeURIComponent(
            ASANAClientID
        )}&client_secret=${encodeURIComponent(ASANASecret)}&refresh_token=${encodeURIComponent(ASANARefreshToken)}`;
        
        const tokenResponse = await fetch(tokenUrl, { method: "POST" });
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            context.error("Token refresh failed:", errorText);
            throw new Error("Failed to refresh Asana token.");
        }

        const tokenData = await tokenResponse.json();
        const accessToken: string = tokenData.access_token;

        // Sanitize the data: log any file uploads and replace their contents with only the file name
        const sanitizedData = sanitizeDataForTask(data, context);
        const description = JSON.stringify(sanitizedData, null, 2);

        // Build task details
        const matterRef = data["Matter Reference"];
        const taskName = matterRef ? `${matterRef} - ${formType}` : formType;
        const today = new Date();
        const dueOn = today.toISOString().split("T")[0];

        // Construct the request body for task creation
        const taskBody: any = {
            data: {
                projects: ["1203336124217593"], // Replace with your actual project ID
                name: taskName,
                notes: description,
                due_on: dueOn,
            }
        };

        // If "Tag me as Collaborator" is true, add the user as a follower
        if (data["Tag me as Collaborator"]) {
            taskBody.data.followers = [ASANAUserID];
        }

        // Create the Asana task
        const asanaResponse = await fetch("https://app.asana.com/api/1.0/tasks", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(taskBody),
        });

        if (!asanaResponse.ok) {
            const errText = await asanaResponse.text();
            context.error("Failed to create Asana task:", errText);
            throw new Error("Asana task creation failed.");
        }

        const asanaResult = await asanaResponse.json();
        context.log("Asana task created successfully:", asanaResult);

        return {
            status: 200,
            body: JSON.stringify({ message: "Task created successfully.", asanaTask: asanaResult }),
        };

    } catch (error: any) {
        context.error("Error in postFinancialTaskHandler:", error);
        return {
            status: 500,
            body: JSON.stringify({ error: error.message || "Unknown error occurred." }),
        };
    } finally {
        context.log("Invocation completed for postFinancialTask Azure Function.");
    }
}

// Function to sanitize data: log file details and replace content with file name
function sanitizeDataForTask(data: any, context: InvocationContext): any {
    const sanitized = { ...data };
    for (const key in sanitized) {
        if (sanitized.hasOwnProperty(key)) {
            const value = sanitized[key];
            // Check if the value is an object representing an uploaded file
            if (value && typeof value === 'object' && 'fileName' in value && 'fileContent' in value) {
                // Log the file details: the file name and the actual contents
                context.log(`File uploaded in field "${key}": Name: ${value.fileName}, Contents: ${value.fileContent}`);
                // Replace the file content with only the file name so that the task gets just the name
                sanitized[key] = value.fileName;
            }
        }
    }
    return sanitized;
}

// Function to query the team table for ASANA credentials and user info based on initials
async function getAsanaCredentials(initials: string, context: InvocationContext): Promise<{ 
    ASANAClientID: string, 
    ASANASecret: string, 
    ASANARefreshToken: string,
    ASANAUserID: string 
} | null> {
    context.log(`Fetching ASANA credentials for initials: ${initials}`);

    // Azure Key Vault details
    const kvUri = "https://helix-keys.vault.azure.net/"; // Replace with your Key Vault URI
    const passwordSecretName = "sql-databaseserver-password"; // Replace with your secret name

    // Initialize SecretClient to fetch the SQL password
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    let password: string | undefined;

    try {
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        password = passwordSecret.value;
        if (!password) {
            context.error(`Password not found in Key Vault secret: ${passwordSecretName}`);
            return null;
        }
    } catch (error) {
        context.error("Error fetching SQL password from Key Vault:", error);
        return null;
    }

    // SQL Server connection details
    const sqlServer = "helix-database-server.database.windows.net"; // Replace with your SQL server
    const sqlDatabase = "helix-core-data"; // Replace with your SQL database

    // Construct the SQL connection configuration
    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error in getAsanaCredentials:", err);
            reject(err);
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("Failed to connect to SQL database in getAsanaCredentials:", err);
                reject(err);
                return;
            }

            const query = `
                SELECT [ASANAClient_ID], [ASANASecret], [ASANARefreshToken], [ASANAUser_ID]
                FROM [dbo].[team]
                WHERE UPPER([Initials]) = @Initials
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error in getAsanaCredentials:", err);
                    reject(err);
                    connection.close();
                    return;
                }

                if (rowCount === 0) {
                    context.warn(`No team member found with initials: ${initials}`);
                }
            });

            let result: { 
                ASANAClientID: string, 
                ASANASecret: string, 
                ASANARefreshToken: string,
                ASANAUserID: string 
            } | null = null;

            sqlRequest.on("row", (columns) => {
                result = {
                    ASANAClientID: columns[0].value,
                    ASANASecret: columns[1].value,
                    ASANARefreshToken: columns[2].value,
                    ASANAUserID: columns[3].value,
                };
            });

            sqlRequest.on("requestCompleted", () => {
                connection.close();
                if (result) {
                    context.log(`ASANA credentials retrieved for initials: ${initials}`);
                } else {
                    context.warn(`No ASANA credentials found for initials: ${initials}`);
                }
                resolve(result);
            });

            sqlRequest.addParameter("Initials", TYPES.NVarChar, initials.toUpperCase());
            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

// Helper function to parse SQL connection string into configuration object for 'tedious'
function parseConnectionString(connectionString: string, context: InvocationContext): any {
    const parts = connectionString.split(';');
    const config: any = {};

    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (!key || !value) return;

        switch (key.trim()) {
            case 'Server':
                config.server = value;
                break;
            case 'Database':
                config.options = { ...config.options, database: value };
                break;
            case 'User ID':
                config.authentication = { type: 'default', options: { userName: value, password: '' } };
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
    config.options.encrypt = true; // For Azure SQL
    config.options.enableArithAbort = true;

    return config;
}

// Register the function with Azure Functions
export default app.http("postFinancialTask", {
    methods: ["POST"],
    authLevel: "function",
    handler: postFinancialTaskHandler,
});
