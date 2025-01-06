// getAnnualLeave.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Handler for the getAnnualLeave Azure Function
export async function getAnnualLeaveHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getAnnualLeave Azure Function.");

    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";

    const projectDataDb = "helix-project-data";
    const coreDataDb = "helix-core-data"; // Added coreDataDb for team data

    try {
        // 1) Retrieve SQL password from Azure Key Vault
        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value || "";
        context.log("Retrieved SQL password from Key Vault.");

        // 2) Parse SQL connection configs for both projectDataDb and coreDataDb
        const projectDataConfig = parseConnectionString(
            `Server=${sqlServer};Database=${projectDataDb};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`,
            context
        );
        const coreDataConfig = parseConnectionString(
            `Server=${sqlServer};Database=${coreDataDb};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`,
            context
        );

        // 3) Determine today's date
        const todayDate = new Date();
        const todayStr = formatDate(todayDate);

        context.log(`Today's Date: ${todayStr}`);

        // 4) Query the annual leave data
        const annualLeaveEntries = await queryAnnualLeave(
            todayDate,
            projectDataConfig,
            context
        );

        // 5) Query the team data
        const teamData = await queryTeamData(
            coreDataConfig,
            context
        );

        return {
            status: 200,
            body: JSON.stringify({
                annual_leave: annualLeaveEntries,
                team: teamData // Include team data in the response
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

// Function to query the annualLeave table
async function queryAnnualLeave(
    today: Date,
    config: any,
    context: InvocationContext
): Promise<{ person: string; start_date: string; end_date: string; reason: string; status: string }[]> {
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

            // SQL query to retrieve annual leave entries where today is between start_date and end_date
            const query = `
                SELECT 
                    [fe] AS person, 
                    [start_date], 
                    [end_date], 
                    [reason], 
                    [status]
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

            const annualLeaveList: { person: string; start_date: string; end_date: string; reason: string; status: string }[] = [];

            sqlRequest.on("row", (columns) => {
                const entry: any = {};
                columns.forEach((col) => {
                    entry[col.metadata.colName] = col.value;
                });

                // Format dates to ISO strings
                const formattedStartDate = entry.start_date ? new Date(entry.start_date).toISOString().split('T')[0] : null;
                const formattedEndDate = entry.end_date ? new Date(entry.end_date).toISOString().split('T')[0] : null;

                annualLeaveList.push({
                    person: entry.person || "",
                    start_date: formattedStartDate || "",
                    end_date: formattedEndDate || "",
                    reason: entry.reason || "",
                    status: entry.status || ""
                });
            });

            sqlRequest.on("requestCompleted", () => {
                context.log("Annual Leave Data Retrieved:", annualLeaveList);
                resolve(annualLeaveList);
                connection.close();
            });

            // Bind parameters
            sqlRequest.addParameter("Today", TYPES.Date, today);

            context.log("Executing SQL query with parameters (AnnualLeave):", {
                Today: today.toISOString().split('T')[0]
            });

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

// Function to query the team table
async function queryTeamData(
    config: any,
    context: InvocationContext
): Promise<{ First: string; Initials: string; ["Entra ID"]: string; Nickname?: string }[]> {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (Team):", err);
            reject("An error occurred with the SQL connection.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (Team):", err);
                reject("Failed to connect to SQL database.");
                return;
            }

            context.log("Successfully connected to SQL database (Team).");

            const query = "SELECT [First], [Initials], [Entra ID], [Nickname] FROM [dbo].[team];";
            context.log("SQL Query (Team):", query);

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error (Team):", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }
                context.log(`SQL query executed successfully (Team). Rows returned: ${rowCount}`);
            });

            const teamData: { First: string; Initials: string; ["Entra ID"]: string; Nickname?: string }[] = [];

            sqlRequest.on("row", (columns) => {
                const obj: any = {};
                columns.forEach((col) => {
                    obj[col.metadata.colName] = col.value;
                });
                teamData.push(obj);
            });

            sqlRequest.on("requestCompleted", () => {
                context.log("Team Data Retrieved:", teamData);
                resolve(teamData);
                connection.close();
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

// Utility function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (`0${(date.getMonth() + 1)}`).slice(-2);
    const day = (`0${date.getDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
}

// Export the Azure Function
export default app.http("getAnnualLeave", {
    methods: ["GET"], // or ["POST"] depending on your requirements
    authLevel: "function",
    handler: getAnnualLeaveHandler,
});
