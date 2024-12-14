import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

/**
 * Handler function to get attendance for a specific day.
 * On Saturday or Sunday, it retrieves attendance for the next Monday.
 */
export async function getAttendanceHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getAttendance Azure Function.");

    // Key Vault and Database configuration
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-project-data"; // Use the correct database

    try {
        // Retrieve the SQL database password from Key Vault
        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value;

        // Build the connection string
        const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
        const config = parseConnectionString(connectionString, context);

        // Determine today's day name and adjust if Saturday or Sunday
        const todayDate = new Date();
        const dayOfWeek = todayDate.getDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
        let dayToCheck: string;

        if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
            dayToCheck = 'Monday';
        } else {
            dayToCheck = todayDate.toLocaleDateString("en-GB", { weekday: "long" });
        }

        // Calculate week ranges based on the dayToCheck
        let currentWeekRange: string;
        let previousWeekRange: string;

        if (dayToCheck === 'Monday') {
            // For weekends, fetch next week's Monday attendance
            const nextMonday = getNextMonday(todayDate);
            const nextWeekStart = new Date(nextMonday);
            const nextWeekEnd = getEndOfWeek(nextWeekStart);
            currentWeekRange = formatWeekRange(nextWeekStart, nextWeekEnd);

            const thisWeekStart = getStartOfWeek(todayDate);
            const thisWeekEnd = getEndOfWeek(todayDate);
            previousWeekRange = formatWeekRange(thisWeekStart, thisWeekEnd);
        } else {
            // For weekdays, fetch current week's attendance
            const currentWeekStart = getStartOfWeek(todayDate);
            const currentWeekEnd = getEndOfWeek(todayDate);
            currentWeekRange = formatWeekRange(currentWeekStart, currentWeekEnd);

            const previousWeekStart = new Date(currentWeekStart);
            previousWeekStart.setDate(currentWeekStart.getDate() - 7);
            const previousWeekEnd = new Date(currentWeekEnd);
            previousWeekEnd.setDate(currentWeekEnd.getDate() - 7);
            previousWeekRange = formatWeekRange(previousWeekStart, previousWeekEnd);
        }

        context.log(`Day to check: ${dayToCheck}`);
        context.log(`Current Week Range: ${currentWeekRange}`);
        context.log(`Previous Week Range: ${previousWeekRange}`);

        // Initiate SQL query to retrieve attendance
        const attendees = await queryAttendanceForToday(dayToCheck, currentWeekRange, previousWeekRange, config, context);
        context.log("Successfully retrieved today's attendance.", { attendees });

        return {
            status: 200,
            body: JSON.stringify(attendees), // Return as JSON array
        };
    } catch (error) {
        context.error("Error retrieving attendance data:", error);
        return {
            status: 500,
            body: "Error retrieving attendance data.",
        };
    } finally {
        context.log("Invocation completed for getAttendance Azure Function.");
    }
}

// Register the function
app.http("getAttendance", {
    methods: ["POST"],
    authLevel: "function",
    handler: getAttendanceHandler,
});

/**
 * Queries the SQL database to get attendees for a specific day.
 * @param day - The day to check attendance for.
 * @param currentWeekRange - The current week's range.
 * @param previousWeekRange - The previous week's range.
 * @param config - The SQL connection configuration.
 * @param context - The invocation context for logging.
 * @returns A promise that resolves to an array of attendee names.
 */
async function queryAttendanceForToday(day: string, currentWeekRange: string, previousWeekRange: string, config: any, context: InvocationContext): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
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

            const query = `
                SELECT [First_Name] AS name, 
                       [Next_Attendance] AS next_attendance,
                       [Current_Attendance] AS current_attendance
                FROM [dbo].[officeAttendance-clioCalendarEntries]
                WHERE 
                    ([Next_Week] = @PreviousWeek AND [Next_Attendance] IS NOT NULL)
                    OR
                    ([Current_Week] = @CurrentWeek AND [Current_Attendance] IS NOT NULL)
                ORDER BY [First_Name];
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

            const attendees: string[] = [];

            sqlRequest.on("row", (columns) => {
                const name = columns[0].value as string; // Extract the name
                const nextAttendance = columns[1].value as string | null; // Next_Attendance
                const currentAttendance = columns[2].value as string | null; // Current_Attendance

                // Check if the specified day is in Next_Attendance
                if (nextAttendance && attendanceIncludesDay(nextAttendance, day)) {
                    attendees.push(name);
                }

                // Check if the specified day is in Current_Attendance
                if (currentAttendance && attendanceIncludesDay(currentAttendance, day)) {
                    attendees.push(name);
                }
            });

            sqlRequest.on("requestCompleted", () => {
                const uniqueAttendees = [...new Set(attendees)].sort(); // Deduplicate and sort alphabetically
                resolve(uniqueAttendees);
                connection.close();
            });

            // Add parameters
            sqlRequest.addParameter("Day", TYPES.NVarChar, day);
            sqlRequest.addParameter("CurrentWeek", TYPES.NVarChar, currentWeekRange);
            sqlRequest.addParameter("PreviousWeek", TYPES.NVarChar, previousWeekRange);

            context.log("Executing SQL query.");
            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

/**
 * Parses the SQL connection string into a configuration object.
 * @param connectionString - The SQL connection string.
 * @param context - The invocation context for logging.
 * @returns The parsed configuration object.
 */
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
                config.authentication = {
                    type: "default",
                    options: { userName: value, password: "" },
                };
                break;
            case "Password":
                if (!config.authentication) {
                    config.authentication = { type: "default", options: { userName: "", password: "" } };
                }
                config.authentication.options.password = value;
                break;
            default:
                break;
        }
    });

    return config;
}

/**
 * Returns the start of the week (Monday) for a given date.
 * @param date - The reference date.
 * @returns The Date object representing the start of the week.
 */
function getStartOfWeek(date: Date): Date {
    const day = date.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // Adjust when day is Sunday
    const start = new Date(date);
    start.setDate(date.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return start;
}

/**
 * Returns the end of the week (Sunday) for a given date.
 * @param date - The reference date.
 * @returns The Date object representing the end of the week.
 */
function getEndOfWeek(date: Date): Date {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
}

/**
 * Formats a week range into the string 'Monday, dd/mm/yyyy - Sunday, dd/mm/yyyy'.
 * @param start - The start date of the week.
 * @param end - The end date of the week.
 * @returns The formatted week range string.
 */
function formatWeekRange(start: Date, end: Date): string {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    const startStr = start.toLocaleDateString("en-GB", options);
    const endStr = end.toLocaleDateString("en-GB", options);
    return `Monday, ${startStr.split(', ')[1]} - Sunday, ${endStr.split(', ')[1]}`;
}

/**
 * Gets the date for the next Monday after the given date.
 * @param date - The reference date.
 * @returns The Date object for the next Monday.
 */
function getNextMonday(date: Date): Date {
    const day = date.getDay();
    const diff = (1 + 7 - day) % 7 || 7; // Days until next Monday
    const nextMonday = new Date(date);
    nextMonday.setDate(date.getDate() + diff);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
}

/**
 * Checks if the attendance string includes the specified day.
 * @param attendance - The attendance string (e.g., "Monday,Tuesday").
 * @param day - The day to check for (e.g., "Monday").
 * @returns True if the day is included, false otherwise.
 */
function attendanceIncludesDay(attendance: string, day: string): boolean {
    const days = attendance.split(',').map(d => d.trim());
    return days.includes(day);
}

export default app;
