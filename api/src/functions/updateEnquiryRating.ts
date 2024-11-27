// src/functions/updateEnquiryRating.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface UpdateRatingBody {
    ID: string;
    Rating: string;
}

// Define the handler function
export async function updateEnquiryRatingHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for updateEnquiryRating Azure Function.");

    let body: UpdateRatingBody;

    try {
        body = await req.json() as UpdateRatingBody;
        context.log("Request body:", { ID: body.ID, Rating: body.Rating });
    } catch (error) {
        context.error("Error parsing JSON body:", error);
        return {
            status: 400,
            body: "Invalid JSON format in request body."
        };
    }

    const { ID, Rating } = body;

    if (!ID || !Rating) {
        context.warn("Missing 'ID' or 'Rating' in request body.");
        return {
            status: 400,
            body: "Missing 'ID' or 'Rating' in request body."
        };
    }

    try {
        context.log("Initiating SQL query to update enquiry rating.");
        await updateRatingInSQL(ID, Rating, context);
        context.log("Successfully updated enquiry rating in SQL database.");

        return {
            status: 200,
            body: "Rating updated successfully."
        };
    } catch (error) {
        context.error("Error updating enquiry rating:", error);
        return {
            status: 500,
            body: "Error updating enquiry rating."
        };
    } finally {
        context.log("Invocation completed for updateEnquiryRating Azure Function.");
    }
}

// Register the function
app.http("updateEnquiryRating", {
    methods: ["POST"],
    authLevel: "function",
    handler: updateEnquiryRatingHandler
});

// Implement the SQL update function
async function updateRatingInSQL(ID: string, Rating: string, context: InvocationContext): Promise<void> {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    return new Promise<void>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error:", err);
            reject("An error occurred with the SQL connection.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error:", err);
                reject("Failed to connect to SQL database.");
                return;
            }

            const query = `
                UPDATE enquiries
                SET Rating = @Rating
                WHERE ID = @ID
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error:", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }

                if (rowCount === 0) {
                    context.warn(`No enquiry found with ID: ${ID}`);
                    reject("No enquiry found with the provided ID.");
                } else {
                    context.log(`Enquiry ID ${ID} updated successfully.`);
                    resolve();
                }

                connection.close();
            });

            sqlRequest.addParameter('Rating', TYPES.NVarChar, Rating);
            sqlRequest.addParameter('ID', TYPES.NVarChar, ID);

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString: string, context: InvocationContext): any {
    const parts = connectionString.split(';');
    const config: any = {};

    parts.forEach(part => {
        const [key, value] = part.split('=');
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
            default:
                break;
        }
    });

    return config;
}

export default app;
