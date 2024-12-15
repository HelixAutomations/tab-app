import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface RequestBody {
    dateFrom: string;
    dateTo: string;
}

// Define the interface for the SQL query result
interface POIDData {
    [key: string]: any;
}

// Define the handler function
export async function getPOIDHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getPOID Azure Function.");

    let body: RequestBody;

    try {
        body = await req.json() as RequestBody;
        context.log("Request body:", { dateFrom: body.dateFrom, dateTo: body.dateTo });
    } catch (error) {
        context.error("Error parsing JSON body:", error);
        return {
            status: 400,
            body: "Invalid JSON format in request body."
        };
    }

    const { dateFrom, dateTo } = body;

    if (!dateFrom || !dateTo) {
        context.warn("Missing 'dateFrom' or 'dateTo' in request body.");
        return {
            status: 400,
            body: "Missing 'dateFrom' or 'dateTo' in request body."
        };
    }

    try {
        context.log("Initiating SQL query to retrieve POID entries.");
        const poidEntries = await queryPOIDFromSQL(dateFrom, dateTo, context);
        context.log("Successfully retrieved POID entries from SQL database.", { poidEntries });

        return {
            status: 200,
            body: JSON.stringify(poidEntries)
        };
    } catch (error) {
        context.error("Error retrieving POID entries:", error);
        return {
            status: 500,
            body: "Error retrieving POID entries."
        };
    } finally {
        context.log("Invocation completed for getPOID Azure Function.");
    }
}

// Register the function
app.http("getPOID", {
    methods: ["POST"],
    authLevel: "function",
    handler: getPOIDHandler
});

// Implement the SQL query function
async function queryPOIDFromSQL(dateFrom: string, dateTo: string, context: InvocationContext): Promise<POIDData[]> {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    return new Promise<POIDData[]>((resolve, reject) => {
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

            // SQL query to fetch POID entries based on date range
            const query = `
                SELECT * FROM poid
                WHERE submission_date BETWEEN @DateFrom AND @DateTo
                ORDER BY submission_date DESC
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error:", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }

                context.log(`SQL query executed successfully. Rows returned: ${rowCount}`);
            });

            const result: POIDData[] = [];

            sqlRequest.on('row', (columns) => {
                const row: POIDData = {};
                columns.forEach((column: { metadata: { colName: string }, value: any }) => {
                    row[column.metadata.colName] = column.value;
                });
                result.push(row);
            });

            sqlRequest.on('requestCompleted', () => {
                resolve(result);
                connection.close();
            });

            // Add parameters for the date range
            sqlRequest.addParameter('DateFrom', TYPES.DateTime, dateFrom);
            sqlRequest.addParameter('DateTo', TYPES.DateTime, dateTo);

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
