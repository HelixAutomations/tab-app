// src/functions/getEnquiries.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface RequestBody {
    email: string;
    dateFrom: string;
    dateTo: string;
}

// Define the interface for the SQL query result (optional, based on your table structure)
interface EnquiryData {
    [key: string]: any;
}

// Define the handler function
export async function getEnquiriesHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getEnquiries Azure Function.");

    let body: RequestBody;

    try {
        body = await req.json() as RequestBody;
        context.log("Request body:", { email: body.email, dateFrom: body.dateFrom, dateTo: body.dateTo });
    } catch (error) {
        context.error("Error parsing JSON body:", error);
        return {
            status: 400,
            body: "Invalid JSON format in request body."
        };
    }

    const { email, dateFrom, dateTo } = body;

    if (!email || !dateFrom || !dateTo) {
        context.warn("Missing 'email', 'dateFrom', or 'dateTo' in request body.");
        return {
            status: 400,
            body: "Missing 'email', 'dateFrom', or 'dateTo' in request body."
        };
    }

    try {
        context.log("Initiating SQL query to retrieve enquiries.");
        const enquiries = await queryEnquiriesFromSQL(email, dateFrom, dateTo, context);
        context.log("Successfully retrieved enquiries from SQL database.", { enquiries });

        return {
            status: 200,
            body: JSON.stringify(enquiries)
        };
    } catch (error) {
        context.error("Error retrieving enquiries:", error);
        return {
            status: 500,
            body: "Error retrieving enquiries."
        };
    } finally {
        context.log("Invocation completed for getEnquiries Azure Function.");
    }
}

// Register the function
app.http("getEnquiries", {
    methods: ["POST"],
    authLevel: "function",
    handler: getEnquiriesHandler
});

// Implement the SQL query function
async function queryEnquiriesFromSQL(email: string, dateFrom: string, dateTo: string, context: InvocationContext): Promise<EnquiryData[]> {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    return new Promise<EnquiryData[]>((resolve, reject) => {
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

            // Determine the SQL query based on the email parameter
            let query = `
                SELECT * FROM enquiries
                WHERE Touchpoint_Date BETWEEN @DateFrom AND @DateTo
            `;

            if (email.toLowerCase() !== 'anyone') {
                query += ` AND Point_of_Contact = @Email`;
            }

            // Order by Touchpoint_Date descending
            query += ` ORDER BY Touchpoint_Date DESC`;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error:", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }

                context.log(`SQL query executed successfully. Rows returned: ${rowCount}`);
            });

            const result: EnquiryData[] = [];

            sqlRequest.on('row', (columns) => {
                const row: EnquiryData = {};
                columns.forEach((column: { metadata: { colName: string }, value: any }) => {
                    row[column.metadata.colName] = column.value;
                });
                result.push(row);
            });

            sqlRequest.on('requestCompleted', () => {
                resolve(result);
                connection.close();
            });

            // Add parameters based on the query
            if (email.toLowerCase() !== 'anyone') {
                sqlRequest.addParameter('Email', TYPES.NVarChar, email);
            }
            sqlRequest.addParameter('DateFrom', TYPES.Date, dateFrom);
            sqlRequest.addParameter('DateTo', TYPES.Date, dateTo);

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
