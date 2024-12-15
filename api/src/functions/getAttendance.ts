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
    const sqlDatabase = "helix-project-data";

    try {
        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value;
        context.log("Retrieved SQL password from Key Vault.");

        const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`;
        const config = parseConnectionString(connectionString, context);
        context.log("Parsed SQL connection configuration.");

        const todayDate = new Date();
        const dayOfWeek = todayDate.getDay();
        let dayToCheck: string;

        // If weekend, set dayToCheck to "Monday"
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            dayToCheck = "Monday";
            const nextMonday = getNextMonday(todayDate);
            const currentWeekStart = nextMonday;
            const currentWeekEnd = getEndOfWeek(currentWeekStart);
            var currentWeekRange = formatWeekRange(currentWeekStart, currentWeekEnd);
        } else {
            // Use current weekday
            dayToCheck = todayDate.toLocaleDateString("en-GB", { weekday: "long" });
            const currentWeekStart = getStartOfWeek(todayDate);
            const currentWeekEnd = getEndOfWeek(currentWeekStart);
            var currentWeekRange = formatWeekRange(currentWeekStart, currentWeekEnd);
        }

        context.log(`Day to check: ${dayToCheck}`);
        context.log(`Current Week Range: ${currentWeekRange}`);

        const attendees = await queryAttendanceForToday(dayToCheck, currentWeekRange, config, context);
        context.log("Successfully retrieved attendance data.", { attendees });

        return {
            status: 200,
            body: JSON.stringify(attendees)
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

async function queryAttendanceForToday(day: string, currentWeekRange: string, config: any, context: InvocationContext): Promise<{name:string;confirmed:boolean;attendingToday:boolean}[]> {
    return new Promise((resolve, reject) => {
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

            context.log("Successfully connected to SQL database.");

            // Modified query: remove IS NOT NULL checks
            const query = `
                SELECT [First_Name] AS name, 
                       [Next_Attendance] AS next_attendance,
                       [Current_Attendance] AS current_attendance
                FROM [dbo].[officeAttendance-clioCalendarEntries]
                WHERE 
                    ([Next_Week] = @CurrentWeek)
                    OR
                    ([Current_Week] = @CurrentWeek)
                ORDER BY [First_Name];
            `;

            context.log("SQL Query:", query);

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error:", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }
                context.log(`SQL query executed successfully. Rows returned: ${rowCount}`);
            });

            interface AttendanceRecord {
                name: string;
                confirmed: boolean;
                attendingToday: boolean;
            }

            const attendanceMap: { [name: string]: AttendanceRecord } = {};

            sqlRequest.on("row", (columns) => {
                const name = columns[0].value as string;
                const nextAttendance = columns[1].value as string | null;
                const currentAttendance = columns[2].value as string | null;

                // If this person doesn't exist in the map, add them
                if (!attendanceMap[name]) {
                    attendanceMap[name] = {
                        name,
                        confirmed: true,       // They appear in the results for this week, so they're confirmed
                        attendingToday: false  // We'll determine if attending today
                    };
                }

                // Check if current or next attendance includes today's day
                if ((nextAttendance && attendanceIncludesDay(nextAttendance, day)) ||
                    (currentAttendance && attendanceIncludesDay(currentAttendance, day))) {
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

            sqlRequest.addParameter("CurrentWeek", TYPES.NVarChar, currentWeekRange);

            context.log("Executing SQL query with parameters:", { Day: day, CurrentWeek: currentWeekRange });

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
    const diff = (day === 0 ? -6 : 1) - day; 
    const start = new Date(date);
    start.setDate(date.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return start;
}

function getEndOfWeek(date: Date): Date {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

function formatWeekRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    const startStr = start.toLocaleDateString("en-GB", options);
    const endStr = end.toLocaleDateString("en-GB", options);
    return `Monday, ${startStr.split(', ')[1]} - Sunday, ${endStr.split(', ')[1]}`;
}

function getNextMonday(date: Date): Date {
    const day = date.getDay();
    const diff = (1 + 7 - day) % 7 || 7;
    const nextMonday = new Date(date);
    nextMonday.setDate(date.getDate() + diff);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
}

function attendanceIncludesDay(attendance: string, day: string): boolean {
    const days = attendance.split(',').map(d => d.trim());
    return days.includes(day);
}

export default app;
