// invisible change
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest } from "tedious";

// Define the interface for the SQL query result with an index signature
export interface TeamData {
    [key: string]: any; // Allows dynamic key assignments
    "Created Date"?: string;        // DATE as string
    "Created Time"?: string;        // TIME as string
    "Full Name"?: string;
    "Last"?: string;
    "First"?: string;
    "Nickname"?: string;
    "Initials"?: string;
    "Email"?: string;
    "Entra ID"?: string;
    "Clio ID"?: string;
    "Rate"?: number;                // MONEY as number
    "Role"?: string;
    "AOW"?: string;
    "holiday_entitlement"?: number; // NEW: Added holiday entitlement field
    "status"?: string;              // New field for team status
}

// Handler Function
export async function getTeamDataHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("getTeamData function triggered.");

    // Ensure the request method is GET
    if (req.method !== "GET") {
        return {
            status: 405,
            body: "Method Not Allowed. Please use GET.",
        };
    }

    try {
        const teamData = await queryAllTeamData(context);
        return {
            status: 200,
            body: JSON.stringify(teamData),
        };
    } catch (error) {
        context.log(`Error fetching team data: ${error}`);
        return {
            status: 500,
            body: "Internal Server Error",
        };
    }
}

// Register the function
app.http("getTeamData", {
    methods: ["GET"],
    authLevel: "function", // Use "function" for function-level auth or "anonymous" if no auth
    handler: getTeamDataHandler,
});

// SQL Query Function
async function queryAllTeamData(context: InvocationContext): Promise<TeamData[]> {
    const kvUri = process.env.KV_URI || "https://helix-keys.vault.azure.net/";
    const passwordSecretName = process.env.SQL_PASSWORD_SECRET_NAME || "sql-databaseserver-password";
    const sqlServer = process.env.SQL_SERVER || "helix-database-server.database.windows.net";
    const sqlDatabase = process.env.SQL_DATABASE || "helix-core-data";
    const sqlUser = process.env.SQL_USER || "helix-database-server";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());

    // Retrieve SQL password from Key Vault
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    // Configure SQL connection
    const config = {
        server: sqlServer,
        authentication: {
            type: "default",
            options: {
                userName: sqlUser,
                password: password,
            },
        },
        options: {
            database: sqlDatabase,
            encrypt: true, // Required for Azure SQL
            trustServerCertificate: false,
        },
    };

    return new Promise<TeamData[]>((resolve, reject) => {
        const connection = new Connection(config);
        const result: TeamData[] = [];

        connection.on("connect", (err) => {
            if (err) {
                context.log(`Connection Failed: ${err}`);
                reject(err);
                return;
            }

            // Updated SELECT query to include holiday_entitlement
            const query = `
                SELECT 
                    [Created Date],
                    [Created Time],
                    [Full Name],
                    [Last],
                    [First],
                    [Nickname],
                    [Initials],
                    [Email],
                    [Entra ID],
                    [Clio ID],
                    [Rate],
                    [Role],
                    [AOW],
                    [holiday_entitlement],
                    [status]
                FROM [dbo].[team]
            `;

            const request = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.log(`Request Failed: ${err}`);
                    reject(err);
                } else {
                    context.log(`Rows returned: ${rowCount}`);
                }
                connection.close();
            });

            request.on("row", (columns) => {
                const row: TeamData = {};
                columns.forEach((column) => {
                    row[column.metadata.colName] = column.value;
                });
                result.push(row);
            });

            request.on("requestCompleted", () => {
                resolve(result);
            });

            connection.execSql(request);
        });

        connection.on("error", (err) => {
            context.log(`Connection Error: ${err}`);
            reject(err);
        });

        connection.connect();
    });
}

export default app;
