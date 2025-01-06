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

        const todayDate = new Date();
        const currentWeekStart = getStartOfWeek(todayDate);
        const currentWeekEnd = getEndOfWeek(currentWeekStart);
        const currentWeekRange = formatWeekRange(currentWeekStart, currentWeekEnd);

        const nextWeekStart = getNextWeekStart(currentWeekStart);
        const nextWeekEnd = getEndOfWeek(nextWeekStart);
        const nextWeekRange = formatWeekRange(nextWeekStart, nextWeekEnd);

        // **Updated Logic: Determine Next Working Day**
        const nextWorkingDayDate = getNextWorkingDay(todayDate);
        const dayToCheck = nextWorkingDayDate.toLocaleDateString("en-GB", { weekday: "long" });

        context.log(`Day to check (Next Working Day): ${dayToCheck}`);
        context.log(`Current Week Range: ${currentWeekRange}`);
        context.log(`Next Week Range: ${nextWeekRange}`);

        const [attendees, teamData] = await Promise.all([
            queryAttendanceForDay(dayToCheck, currentWeekRange, nextWeekRange, projectDataConfig, context),
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

async function queryAttendanceForDay(
    day: string,
    currentWeekRange: string,
    nextWeekRange: string,
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
                    [Next_Week] = @NextWeek
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

                if (!attendanceMap[name]) {
                    attendanceMap[name] = {
                        name,
                        confirmed: true,
                        attendingToday: false
                    };
                }

                const isCurrentWeekRelevant = currentWeek === currentWeekRange;
                const isNextWeekRelevant = nextWeek === nextWeekRange; // **Fixed Comparison**

                context.log(`Processing attendee: ${name}`);
                context.log(`isCurrentWeekRelevant: ${isCurrentWeekRelevant}, isNextWeekRelevant: ${isNextWeekRelevant}`);

                if (
                    (isCurrentWeekRelevant && currentAttendance && attendanceIncludesDay(currentAttendance, day)) ||
                    (isNextWeekRelevant && nextAttendance && attendanceIncludesDay(nextAttendance, day))
                ) {
                    attendanceMap[name].attendingToday = true;
                    context.log(`Marking ${name} as attending today.`);
                } else {
                    context.log(`Not attending today: ${name}, Current: "${currentAttendance}", Next: "${nextAttendance}"`);
                }
            });

            sqlRequest.on("requestCompleted", () => {
                const results = Object.values(attendanceMap);
                results.sort((a, b) => a.name.localeCompare(b.name));
                context.log("Unique Attendees with Confirmation Info:", results);
                resolve(results);
                connection.close();
            });

            sqlRequest.addParameter("CurrentWeek", TYPES.NVarChar, currentWeekRange);
            sqlRequest.addParameter("NextWeek", TYPES.NVarChar, nextWeekRange);

            context.log("Executing SQL query with parameters (Attendance):", { CurrentWeek: currentWeekRange, NextWeek: nextWeekRange });

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
    if (!attendance) return false;
    const days = attendance.split(",").map((d) => d.trim().toLowerCase());
    const targetDay = day.toLowerCase();
    const includes = days.includes(targetDay);
    // Optional: Uncomment the following line for debugging
    // console.log(`Checking attendance: "${attendance}" for day: "${day}" => ${includes}`);
    return includes;
}

/**
 * **New Function: Get Next Working Day**
 * 
 * Determines the next working day (Monday to Friday) based on the given date.
 * Skips weekends (Saturday and Sunday).
 * 
 * @param date - The current date
 * @returns The next working day as a Date object
 */
function getNextWorkingDay(date: Date): Date {
    const nextDay = new Date(date);
    nextDay.setDate(date.getDate() + 1); // Start with the next day

    // Loop until the next working day is found (Monday to Friday)
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) { // 0 = Sunday, 6 = Saturday
        nextDay.setDate(nextDay.getDate() + 1);
    }

    nextDay.setHours(0, 0, 0, 0);
    return nextDay;
}

export default app;