// src/functions/getAttendance.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

export async function getAttendanceHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getAttendance Azure Function.");

    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";

    const projectDataDb = "helix-project-data";
    const coreDataDb = "helix-core-data";

    try {
        // Retrieve SQL password from Azure Key Vault
        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value;
        context.log("Retrieved SQL password from Key Vault.");

        // Parse SQL connection strings
        const projectDataConfig = parseConnectionString(
            `Server=${sqlServer};Database=${projectDataDb};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`,
            context
        );
        const coreDataConfig = parseConnectionString(
            `Server=${sqlServer};Database=${coreDataDb};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`,
            context
        );

        context.log("Parsed SQL connection configurations.");

        const todayDate = new Date("2025-01-02"); // For testing purposes; replace with `new Date()` in production
        const dayOfWeek = todayDate.getDay(); // 0 (Sunday) to 6 (Saturday)
        let dayToCheck: string;

        // Determine current week range
        const currentWeekStart = getStartOfWeek(todayDate);
        const currentWeekEnd = getEndOfWeek(currentWeekStart);
        const currentWeekRange = formatWeekRange(currentWeekStart, currentWeekEnd);

        // Determine next week range (not used in current logic)
        const nextWeekStart = getNextWeekStart(currentWeekStart);
        const nextWeekEnd = getEndOfWeek(nextWeekStart);
        const nextWeekRange = formatWeekRange(nextWeekStart, nextWeekEnd);

        // Determine the day to check
        if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
            dayToCheck = "Monday";
        } else {
            dayToCheck = todayDate.toLocaleDateString("en-GB", { weekday: "long" });
        }

        context.log(`Day to check: ${dayToCheck}`);
        context.log(`Current Week Range: ${currentWeekRange}`);
        context.log(`Next Week Range: ${nextWeekRange}`);

        // Fetch attendance and team data concurrently
        const [attendees, teamData] = await Promise.all([
            queryAttendanceForToday(dayToCheck, currentWeekRange, projectDataConfig, context),
            queryTeamData(coreDataConfig, context)
        ]);

        context.log("Successfully retrieved attendance and team data.", { attendees, teamData });

        return {
            status: 200,
            body: JSON.stringify({
                attendance: attendees,
                team: teamData
            })
        };
    } catch (error) {
        context.error("Error retrieving attendance data:", error);
        return {
            status: 500,
            body: "Error retrieving attendance data."
        };
    } finally {
        context.log("Invocation completed for getAttendance Azure Function.");
    }
}

app.http("getAttendance", {
    methods: ["POST"],
    authLevel: "function",
    handler: getAttendanceHandler,
});

async function queryAttendanceForToday(
    day: string,
    currentWeekRange: string,
    config: any,
    context: InvocationContext
): Promise<{ name: string; confirmed: boolean; attendingToday: boolean }[]> {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (Attendance):", err);
            reject("An error occurred with the SQL connection.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (Attendance):", err);
                reject("Failed to connect to SQL database.");
                return;
            }

            context.log("Successfully connected to SQL database (Attendance).");

            const query = `
                SELECT 
                    [First_Name] AS name, 
                    [Current_Attendance] AS current_attendance,
                    [Current_Week] AS current_week,
                    [Next_Attendance] AS next_attendance,
                    [Next_Week] AS next_week
                FROM [dbo].[officeAttendance-clioCalendarEntries]
                WHERE 
                    [Current_Week] = @CurrentWeek
                    OR
                    [Next_Week] = @CurrentWeek
                ORDER BY [First_Name];
            `;

            context.log("SQL Query (Attendance):", query);

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error (Attendance):", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }
                context.log(`SQL query executed successfully (Attendance). Rows returned: ${rowCount}`);
            });

            interface AttendanceRecord {
                name: string;
                confirmed: boolean;
                attendingToday: boolean;
            }

            const attendanceMap: { [name: string]: AttendanceRecord } = {};

            sqlRequest.on("row", (columns) => {
                const name = columns[0].value as string;
                const currentAttendance = columns[1].value as string | null;
                const currentWeek = columns[2].value as string;
                const nextAttendance = columns[3].value as string | null;
                const nextWeek = columns[4].value as string;

                // Initialize the record if it doesn't exist
                if (!attendanceMap[name]) {
                    attendanceMap[name] = {
                        name,
                        confirmed: true,
                        attendingToday: false
                    };
                }

                // Check Current_Attendance
                if (currentWeek === currentWeekRange && currentAttendance && attendanceIncludesDay(currentAttendance, day)) {
                    attendanceMap[name].attendingToday = true;
                }

                // Check Next_Attendance
                if (nextWeek === currentWeekRange && nextAttendance && attendanceIncludesDay(nextAttendance, day)) {
                    attendanceMap[name].attendingToday = true;
                }
            });

            sqlRequest.on("requestCompleted", () => {
                const results = Object.values(attendanceMap);
                results.sort((a, b) => a.name.localeCompare(b.name));
                context.log("Unique Attendees with Confirmation Info:", results);
                resolve(results);
                connection.close();
            });

            // Add parameters for current week only
            sqlRequest.addParameter("CurrentWeek", TYPES.NVarChar, currentWeekRange);

            context.log("Executing SQL query with parameters (Attendance):", { CurrentWeek: currentWeekRange });

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

async function queryTeamData(config: any, context: InvocationContext): Promise<{ First: string; Initials: string; ["Entra ID"]: string; Nickname?: string }[]> {
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

            const query = `SELECT [First], [Initials], [Entra ID], [Nickname] FROM [dbo].[team];`;

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

function getStartOfWeek(date: Date): Date {
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // Adjust when day is Sunday
    const start = new Date(date);
    start.setDate(date.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return start;
}

function getNextWeekStart(currentWeekStart: Date): Date {
    const nextWeekStart = new Date(currentWeekStart);
    nextWeekStart.setDate(currentWeekStart.getDate() + 7);
    nextWeekStart.setHours(0, 0, 0, 0);
    return nextWeekStart;
}

function getEndOfWeek(startDate: Date): Date {
    const end = new Date(startDate);
    end.setDate(startDate.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

function formatWeekRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    const startStr = start.toLocaleDateString("en-GB", options);
    const endStr = end.toLocaleDateString("en-GB", options);
    return `Monday, ${startStr.split(', ')[1]} - Sunday, ${endStr.split(', ')[1]}`;
}

function attendanceIncludesDay(attendance: string, day: string): boolean {
    const days = attendance.split(',').map(d => d.trim());
    return days.includes(day);
}

export default app;
