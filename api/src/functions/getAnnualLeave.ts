// invisible change 2
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Interfaces
interface AnnualLeaveRecord {
    request_id: number;
    person: string;
    start_date: string;
    end_date: string;
    reason: string;
    status: string;
    days_taken: number;
    leave_type: string | null;
    rejection_notes: string | null;
    AOW?: string | null;
    approvers?: string[];
    hearing_confirmation?: string | null;
    hearing_details?: string | null;
}

interface UserDetails {
    leaveEntries: AnnualLeaveRecord[];
    totals: {
        standard: number;
        unpaid: number;
        sale: number; // Changed from "purchase" to "sale"
        rejected: number;
        AOW?: string | null;
    };
}

interface AnnualLeaveResponse {
    annual_leave: AnnualLeaveRecord[];
    future_leave: AnnualLeaveRecord[];
    user_details: UserDetails;
    all_data?: AnnualLeaveRecord[];
}

interface TeamData {
    Initials: string;
    AOW: string | null;
}

// Helper function to read and parse the HTTP request body.
async function getRequestBody(req: HttpRequest): Promise<any> {
    if (req.body && typeof req.body === 'object' && !(req.body as any).getReader) {
        return req.body;
    }
    if (typeof req.body === 'string') {
        try {
            return JSON.parse(req.body);
        } catch (err) {
            throw new Error("Unable to parse request body string as JSON.");
        }
    }
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
    return {};
}

// Handler for the getAnnualLeave Azure Function
export async function getAnnualLeaveHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getAnnualLeave Azure Function.");

    // Parse request body
    let body: any;
    try {
        body = await getRequestBody(req);
        context.log("Successfully parsed request body.");
    } catch (error) {
        context.error("Error parsing request body:", error);
        return {
            status: 400,
            body: "Invalid request body. Ensure it's valid JSON."
        };
    }

    // Extract necessary information from the request body
    const userInitials: string = body.initials;
    if (!userInitials) {
        context.warn("Missing 'initials' in request body.");
        return {
            status: 400,
            body: "Missing 'initials' in request body."
        };
    }

    context.log(`Received initials: ${userInitials}`);

    try {
        // Step 1: Retrieve SQL password from Azure Key Vault
        const kvUri = "https://helix-keys.vault.azure.net/";
        const passwordSecretName = "sql-databaseserver-password";
        const sqlServerProjectData = "helix-database-server.database.windows.net";
        const sqlDatabaseProjectData = "helix-project-data";

        const sqlServerCoreData = "helix-database-server.database.windows.net";
        const sqlDatabaseCoreData = "helix-core-data";

        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value || "";
        context.log("Retrieved SQL password from Key Vault.");

        // Step 2: Parse connection strings
        const connectionStringProjectData = `Server=${sqlServerProjectData};Database=${sqlDatabaseProjectData};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
        const configProjectData = parseConnectionString(connectionStringProjectData, context);

        const connectionStringCoreData = `Server=${sqlServerCoreData};Database=${sqlDatabaseCoreData};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
        const configCoreData = parseConnectionString(connectionStringCoreData, context);

        // Step 3: Fetch Team Data (Initials and AOW)
        const teamAowMap = await queryTeamDataFromSQL(configCoreData, context);
        context.log("Fetched team AOW data.");

        // Step 4: Fetch Annual Leave Data
        const [annualLeaveEntries, futureLeaveEntries, userDetails] = await Promise.all([
            queryAnnualLeave(configProjectData, context),
            queryFutureLeave(configProjectData, context),
            queryUserAnnualLeave(userInitials, configProjectData, context, teamAowMap)
        ]);

        // Step 4.5: Fetch all annual leave data from the table
        const allAnnualLeaveEntries = await queryAllAnnualLeave(configProjectData, context);

        // Step 5: Enhance leave entries with AOW and Approvers
        const enhanceLeaveWithAOWAndApprover = (leaveEntries: AnnualLeaveRecord[]): AnnualLeaveRecord[] => {
            return leaveEntries.map(entry => ({
                ...entry,
                AOW: teamAowMap.get(entry.person) || null,
                approvers: determineApprovers(teamAowMap.get(entry.person) || "")
            }));
        };

        const enhancedAnnualLeave = enhanceLeaveWithAOWAndApprover(annualLeaveEntries);
        const enhancedFutureLeave = enhanceLeaveWithAOWAndApprover(futureLeaveEntries);
        const enhancedAllAnnualLeave = enhanceLeaveWithAOWAndApprover(allAnnualLeaveEntries);

        // Step 6: Enhance user_details with AOW
        const userAow = teamAowMap.get(userInitials) || null;
        const enhancedUserDetails: UserDetails = {
            ...userDetails,
            totals: {
                ...userDetails.totals,
                AOW: userAow
            }
        };

        // Step 7: Construct the response
        const response: AnnualLeaveResponse = {
            annual_leave: enhancedAnnualLeave,
            future_leave: enhancedFutureLeave,
            user_details: enhancedUserDetails,
            all_data: enhancedAllAnnualLeave
        };

        context.log("Successfully constructed the response.");

        return {
            status: 200,
            body: JSON.stringify(response)
        };
    } catch (error: any) {
        context.error("Error processing getAnnualLeave:", error);
        return {
            status: 500,
            body: "An error occurred while processing your request."
        };
    }
}

// Register the function
app.http("getAnnualLeave", {
    methods: ["POST"],
    authLevel: "function",
    handler: getAnnualLeaveHandler
});

// SQL query functions

async function queryTeamDataFromSQL(config: any, context: InvocationContext): Promise<Map<string, string | null>> {
    context.log("Starting SQL query to fetch team data (Initials and AOW).");

    return new Promise<Map<string, string | null>>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (Team Data):", err);
            reject("An error occurred with the SQL connection for team data.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (Team Data):", err);
                reject("Failed to connect to SQL database for team data.");
                return;
            }

            const query = `SELECT [Initials], [AOW] FROM [dbo].[team];`;
            const teamAowMap: Map<string, string | null> = new Map();

            const request = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    reject(err);
                    connection.close();
                    return;
                }
                connection.close();
            });

            request.on("row", (columns) => {
                const initials = columns.find(col => col.metadata.colName === 'Initials')?.value;
                const aow = columns.find(col => col.metadata.colName === 'AOW')?.value;
                if (initials) {
                    teamAowMap.set(initials, aow || null);
                }
            });

            request.on("requestCompleted", () => {
                resolve(teamAowMap);
            });

            connection.execSql(request);
        });

        connection.connect();
    });
}

function determineApprovers(aow: string): string[] {
    const aowList = aow.toLowerCase().split(',').map(item => item.trim()).filter(Boolean);
    let approver = 'AC'; // Default approver

    const isConstruction = aowList.some((item) => item === 'cs' || item.includes('construction'));
    if (isConstruction) {
        approver = 'JW';
    }

    return ['LZ', approver];
}

async function queryAnnualLeave(config: any, context: InvocationContext): Promise<AnnualLeaveRecord[]> {
    context.log("Starting SQL query to fetch annual leave data.");

    return new Promise<AnnualLeaveRecord[]>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (AnnualLeave):", err);
            reject("An error occurred with the SQL connection for annual leave.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (AnnualLeave):", err);
                reject("Failed to connect to SQL database for annual leave.");
                return;
            }

            const today = new Date();
            const query = `
                SELECT 
                    [request_id],
                    [fe] AS person, 
                    [start_date], 
                    [end_date], 
                    [reason], 
                    [status], 
                    [days_taken], 
                    [leave_type],
                    [rejection_notes],
                    [hearing_confirmation],
                    [hearing_details]
                FROM [dbo].[annualLeave]
                WHERE 
                    @Today BETWEEN [start_date] AND [end_date];
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    reject(err);
                    connection.close();
                    return;
                }
            });

            const annualLeaveList: AnnualLeaveRecord[] = [];

            sqlRequest.on("row", (columns) => {
                const entry: any = {};
                columns.forEach((col) => {
                    entry[col.metadata.colName] = col.value;
                });

                annualLeaveList.push({
                    request_id: entry.request_id,
                    person: entry.person || "",
                    start_date: formatDate(new Date(entry.start_date)),
                    end_date: formatDate(new Date(entry.end_date)),
                    reason: entry.reason || "",
                    status: entry.status || "",
                    days_taken: entry.days_taken || 0,
                    leave_type: entry.leave_type || null,
                    rejection_notes: entry.rejection_notes || null,
                    hearing_confirmation: entry.hearing_confirmation || null,
                    hearing_details: entry.hearing_details || null,
                });
            });

            sqlRequest.on("requestCompleted", () => {
                resolve(annualLeaveList);
                connection.close();
            });

            sqlRequest.addParameter("Today", TYPES.Date, today);
            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

async function queryFutureLeave(config: any, context: InvocationContext): Promise<AnnualLeaveRecord[]> {
    context.log("Starting SQL query to fetch future leave data.");

    return new Promise<AnnualLeaveRecord[]>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (FutureLeave):", err);
            reject("An error occurred with the SQL connection for future leave.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (FutureLeave):", err);
                reject("Failed to connect to SQL database for future leave.");
                return;
            }

            const today = new Date();
            const query = `
                SELECT 
                    [request_id],
                    [fe] AS person, 
                    [start_date], 
                    [end_date], 
                    [reason], 
                    [status], 
                    [days_taken], 
                    [leave_type],
                    [rejection_notes],
                    [hearing_confirmation],
                    [hearing_details]
                FROM [dbo].[annualLeave]
                WHERE 
                    [start_date] >= @Today;
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    reject(err);
                    connection.close();
                    return;
                }
            });

            const futureLeaveList: AnnualLeaveRecord[] = [];

            sqlRequest.on("row", (columns) => {
                const entry: any = {};
                columns.forEach((col) => {
                    entry[col.metadata.colName] = col.value;
                });

                futureLeaveList.push({
                    request_id: entry.request_id,
                    person: entry.person || "",
                    start_date: formatDate(new Date(entry.start_date)),
                    end_date: formatDate(new Date(entry.end_date)),
                    reason: entry.reason || "",
                    status: entry.status || "",
                    days_taken: entry.days_taken || 0,
                    leave_type: entry.leave_type || null,
                    rejection_notes: entry.rejection_notes || null,
                    hearing_confirmation: entry.hearing_confirmation || null,
                    hearing_details: entry.hearing_details || null,
                });
            });

            sqlRequest.on("requestCompleted", () => {
                resolve(futureLeaveList);
                connection.close();
            });

            sqlRequest.addParameter("Today", TYPES.Date, today);
            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

async function queryAllAnnualLeave(config: any, context: InvocationContext): Promise<AnnualLeaveRecord[]> {
    context.log("Starting SQL query to fetch all annual leave data.");
    return new Promise<AnnualLeaveRecord[]>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (AllAnnualLeave):", err);
            reject("An error occurred with the SQL connection for all annual leave.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (AllAnnualLeave):", err);
                reject("Failed to connect to SQL database for all annual leave.");
                return;
            }

            const query = `
                SELECT 
                    [request_id],
                    [fe] AS person, 
                    [start_date], 
                    [end_date], 
                    [reason], 
                    [status], 
                    [days_taken], 
                    [leave_type],
                    [rejection_notes],
                    [hearing_confirmation],
                    [hearing_details]
                FROM [dbo].[annualLeave];
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    reject(err);
                    connection.close();
                    return;
                }
            });

            const allAnnualLeaveList: AnnualLeaveRecord[] = [];

            sqlRequest.on("row", (columns) => {
                const entry: any = {};
                columns.forEach((col) => {
                    entry[col.metadata.colName] = col.value;
                });

                allAnnualLeaveList.push({
                    request_id: entry.request_id,
                    person: entry.person || "",
                    start_date: formatDate(new Date(entry.start_date)),
                    end_date: formatDate(new Date(entry.end_date)),
                    reason: entry.reason || "",
                    status: entry.status || "",
                    days_taken: entry.days_taken || 0,
                    leave_type: entry.leave_type || null,
                    rejection_notes: entry.rejection_notes || null,
                    hearing_confirmation: entry.hearing_confirmation || null,
                    hearing_details: entry.hearing_details || null,
                });
            });

            sqlRequest.on("requestCompleted", () => {
                resolve(allAnnualLeaveList);
                connection.close();
            });

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

async function queryUserAnnualLeave(initials: string, config: any, context: InvocationContext, teamAowMap: Map<string, string | null>): Promise<UserDetails> {
    context.log("Starting SQL query to fetch user-specific annual leave data.");

    return new Promise<UserDetails>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (UserAnnualLeave):", err);
            reject("An error occurred with the SQL connection for user annual leave.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (UserAnnualLeave):", err);
                reject("Failed to connect to SQL database for user annual leave.");
                return;
            }

            // Compute fiscal year boundaries (April 1 - March 31)
            const today = new Date();
            let fiscalStart: Date, fiscalEnd: Date;
            const currentMonth = today.getMonth();
            if (currentMonth < 3) {
                fiscalStart = new Date(today.getFullYear() - 1, 3, 1);
                fiscalEnd = new Date(today.getFullYear(), 2, 31);
            } else {
                fiscalStart = new Date(today.getFullYear(), 3, 1);
                fiscalEnd = new Date(today.getFullYear() + 1, 2, 31);
            }

            const fiscalStartStr = formatDate(fiscalStart);
            const fiscalEndStr = formatDate(fiscalEnd);
            context.log("Fiscal Year Boundaries:", { fiscalStart: fiscalStartStr, fiscalEnd: fiscalEndStr });

            const query = `
                SELECT 
                    [request_id],
                    [fe] AS person,
                    [start_date],
                    [end_date],
                    [reason],
                    [status],
                    [days_taken],
                    [leave_type],
                    [rejection_notes],
                    [hearing_confirmation],
                    [hearing_details]
                FROM [dbo].[annualLeave]
                WHERE [fe] = @Initials
                  AND [start_date] >= @FiscalStart
                  AND [start_date] <= @FiscalEnd;
            `;

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    reject(err);
                    connection.close();
                    return;
                }
            });

            const leaveEntries: AnnualLeaveRecord[] = [];

            sqlRequest.on("row", (columns) => {
                const entry: any = {};
                columns.forEach((col) => {
                    entry[col.metadata.colName] = col.value;
                });

                leaveEntries.push({
                    request_id: entry.request_id,
                    person: entry.person || "",
                    start_date: formatDate(new Date(entry.start_date)),
                    end_date: formatDate(new Date(entry.end_date)),
                    reason: entry.reason || "",
                    status: entry.status || "",
                    days_taken: entry.days_taken || 0,
                    leave_type: entry.leave_type || null,
                    rejection_notes: entry.rejection_notes || null,
                    hearing_confirmation: entry.hearing_confirmation || null,
                    hearing_details: entry.hearing_details || null,
                });
            });

            sqlRequest.on("requestCompleted", () => {
                // Calculate totals
                let total_standard = 0;
                let total_unpaid = 0;
                let total_sale = 0; // Changed from "total_purchase" to "total_sale"
                let total_rejected = 0;

                leaveEntries.forEach(entry => {
                    if (entry.leave_type && typeof entry.days_taken === "number") {
                        const lt = entry.leave_type.toLowerCase();
                        const status = entry.status.toLowerCase();
                        
                        // Count approved and booked leave toward totals (not rejected or requested)
                        if (lt === "standard" && (status === "booked" || status === "approved")) {
                            total_standard += entry.days_taken;
                        } else if (lt === "unpaid" && (status === "booked" || status === "approved")) {
                            total_unpaid += entry.days_taken;
                        } else if (lt === "sale" && (status === "booked" || status === "approved")) {
                            total_sale += entry.days_taken;
                        }
                        
                        if (status === "rejected" && entry.rejection_notes) {
                            total_rejected += entry.days_taken;
                        }
                    }
                });

                const userAow = teamAowMap.get(initials) || null;

                resolve({
                    leaveEntries,
                    totals: {
                        standard: total_standard,
                        unpaid: total_unpaid,
                        sale: total_sale, // Changed from "purchase" to "sale"
                        rejected: total_rejected,
                        AOW: userAow
                    }
                });
                connection.close();
            });

            sqlRequest.addParameter("Initials", TYPES.NVarChar, initials);
            sqlRequest.addParameter("FiscalStart", TYPES.Date, fiscalStart);
            sqlRequest.addParameter("FiscalEnd", TYPES.Date, fiscalEnd);
            context.log("Executing SQL query with parameters (UserAnnualLeave):", {
                Initials: initials,
                FiscalStart: fiscalStartStr,
                FiscalEnd: fiscalEndStr
            });
            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

function parseConnectionString(connectionString: string, context: InvocationContext): any {
    context.log("Parsing SQL connection string.");
    const parts = connectionString.split(";");
    const config: any = {};

    parts.forEach((part) => {
        const [key, value] = part.split("=");
        if (!key || !value) {
            context.warn(`Invalid connection string part encountered: '${part}'`);
            return;
        }

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
                context.warn(`Unknown connection string key encountered: '${key}'`);
                break;
        }
    });

    context.log("SQL connection configuration parsed successfully:", config);
    return config;
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (`0${(date.getMonth() + 1)}`).slice(-2);
    const day = (`0${date.getDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
}

export default app;