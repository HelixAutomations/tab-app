import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the SQL query result (optional, based on your table structure)
interface CollectedTimeData {
    [key: string]: any;
}

// Define the interface for the request body
interface RequestBody {
    ClioID: number;  // Ensure the correct casing for ClioID
}

// Define the handler function
export async function getRecoveredHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getRecovered Azure Function.");

    let body: RequestBody; // Define the body type explicitly

    try {
        body = await req.json() as RequestBody;  // Type assertion to ensure body is of type RequestBody
        context.log("Request body:", { ClioID: body.ClioID });
    } catch (error) {
        context.error("Error parsing JSON body:", error);
        return {
            status: 400,
            body: "Invalid JSON format in request body."
        };
    }

    const { ClioID } = body;

    if (!ClioID) {
        context.warn("Missing 'ClioID' in request body.");
        return {
            status: 400,
            body: "Missing 'ClioID' in request body."
        };
    }

    try {
        context.log("Initiating SQL query to retrieve collected time records.");
        const { totalPaymentAllocated } = await queryCollectedTimeFromSQL(ClioID, context);
        context.log("Successfully retrieved collected time data from SQL database.", { totalPaymentAllocated });

        return {
            status: 200,
            body: JSON.stringify({ totalPaymentAllocated })
        };
    } catch (error) {
        context.error("Error retrieving collected time records:", error);
        return {
            status: 500,
            body: "Error retrieving collected time records."
        };
    } finally {
        context.log("Invocation completed for getRecovered Azure Function.");
    }
}

// Register the function
app.http("getRecovered", {
    methods: ["POST"],
    authLevel: "function",
    handler: getRecoveredHandler
});

// Implement the SQL query function
async function queryCollectedTimeFromSQL(ClioID: number, context: InvocationContext): Promise<{ totalPaymentAllocated: number }> {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    return new Promise<{ totalPaymentAllocated: number }>((resolve, reject) => {
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

            // Determine the SQL query to retrieve the total payment_allocated value
            const startDate = new Date();
            const startOfMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const endDate = new Date(startDate);
            const formattedStartDate = startOfMonth.toISOString().split('T')[0]; // Get YYYY-MM-DD format
            const formattedEndDate = endDate.toISOString().split('T')[0]; // Get YYYY-MM-DD format

            let query = `
                SELECT SUM(payment_allocated) AS totalPaymentAllocated
                FROM collectedTime
                WHERE user_id = @ClioID
                AND payment_date BETWEEN @StartDate AND @EndDate
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

            let totalPaymentAllocated = 0;

            sqlRequest.on('row', (columns) => {
                columns.forEach((column: { metadata: { colName: string }, value: any }) => {
                    if (column.metadata.colName === 'totalPaymentAllocated') {
                        totalPaymentAllocated = column.value || 0;
                    }
                });
            });

            sqlRequest.on('requestCompleted', () => {
                resolve({ totalPaymentAllocated });
                connection.close();
            });

            // Add parameters for the SQL query
            sqlRequest.addParameter('ClioID', TYPES.Int, ClioID);
            sqlRequest.addParameter('StartDate', TYPES.Date, formattedStartDate);
            sqlRequest.addParameter('EndDate', TYPES.Date, formattedEndDate);

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
