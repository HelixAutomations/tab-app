// src/functions/getWIP.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the expected structure of the request body
interface GetMonthlyWIPRequest {
    ClioID: number;
}

export async function getMonthlyWIPHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getMonthlyWIP Azure Function.");

    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const sqlServer = "helix-database-server.database.windows.net";
    const coreDataDb = "helix-core-data";

    try {
        // Parse and validate the request body
        const requestBody = await getRequestBody(req) as GetMonthlyWIPRequest;

        if (!requestBody || typeof requestBody.ClioID === 'undefined') {
            context.log("ClioID not provided in the request body.");
            return {
                status: 400,
                body: JSON.stringify({ error: "ClioID is required in the request body." })
            };
        }

        const ClioID = Number(requestBody.ClioID);
        if (isNaN(ClioID)) {
            context.log("Invalid ClioID provided.");
            return {
                status: 400,
                body: JSON.stringify({ error: "Invalid ClioID provided. It must be a number." })
            };
        }

        context.log(`Received ClioID: ${ClioID}`);

        // Retrieve SQL password from Key Vault
        const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        const password = passwordSecret.value;
        context.log("Retrieved SQL password from Key Vault.");

        // Parse SQL connection configurations
        const coreDataConfig = parseConnectionString(
            `Server=${sqlServer};Database=${coreDataDb};User ID=helix-database-server;Password=${password};Encrypt=true;TrustServerCertificate=false;`,
            context
        );

        context.log("Parsed SQL connection configurations.");

        // Calculate current week and last week date ranges
        const { currentWeekStart, currentWeekEnd, lastWeekStart, lastWeekEnd } = getWeekDateRanges(new Date());

        context.log("Calculated week date ranges:", { currentWeekStart, currentWeekEnd, lastWeekStart, lastWeekEnd });

        // Query WIP data for both weeks
        const wipData = await queryWIPData(ClioID, lastWeekStart, lastWeekEnd, currentWeekStart, currentWeekEnd, coreDataConfig, context);

        // Structure the response
        const response = structureResponse(wipData, lastWeekStart, lastWeekEnd, currentWeekStart, currentWeekEnd);

        context.log("Successfully retrieved and structured WIP data.");

        return {
            status: 200,
            body: JSON.stringify(response)
        };
    } catch (error) {
        context.error("Error retrieving WIP data:", error);
        return {
            status: 500,
            body: JSON.stringify({ error: "Error retrieving WIP data." })
        };
    } finally {
        context.log("Invocation completed for getMonthlyWIP Azure Function.");
    }
}

app.http("getMonthlyWIP", {
    methods: ["POST"],
    authLevel: "function", // Use 'function' if you're using function keys for access
    handler: getMonthlyWIPHandler,
});

/**
 * Reads and parses the request body as JSON.
 * @param req - The HttpRequest object.
 * @returns A promise that resolves to the parsed JSON object.
 */
async function getRequestBody(req: HttpRequest): Promise<any> {
    if (req.body instanceof ReadableStream) {
        const reader = req.body.getReader();
        const decoder = new TextDecoder();
        let result = '';
        let done = false;

        while (!done) {
            const { value, done: doneReading } = await reader.read();
            done = doneReading;
            if (value) {
                result += decoder.decode(value);
            }
        }

        try {
            return JSON.parse(result);
        } catch (error) {
            throw new Error("Invalid JSON format in request body.");
        }
    } else {
        return req.body;
    }
}

/**
 * Calculates the start and end dates for the current and last weeks.
 * Assumes weeks start on Monday and end on Sunday.
 * @param referenceDate - The date to calculate the weeks based on.
 * @returns An object containing the start and end dates for the current and last weeks.
 */
function getWeekDateRanges(referenceDate: Date) {
    const currentWeekStart = getMonday(referenceDate);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekStart.getDate() + 6); // Sunday

    const lastWeekEnd = new Date(currentWeekStart);
    lastWeekEnd.setDate(currentWeekStart.getDate() - 1); // Last Sunday
    const lastWeekStart = getMonday(lastWeekEnd);

    // Set time to cover the entire day
    setStartOfDay(currentWeekStart);
    setEndOfDay(currentWeekEnd);
    setStartOfDay(lastWeekStart);
    setEndOfDay(lastWeekEnd);

    return { currentWeekStart, currentWeekEnd, lastWeekStart, lastWeekEnd };
}

/**
 * Returns the Monday of the week for the given date.
 * @param d - The date to find the Monday for.
 * @returns A Date object representing the Monday of the week.
 */
function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust when day is Sunday
    date.setDate(date.getDate() + diff);
    return date;
}

/**
 * Sets the time of a Date object to the start of the day (00:00:00.000).
 * @param date - The Date object to modify.
 */
function setStartOfDay(date: Date) {
    date.setHours(0, 0, 0, 0);
}

/**
 * Sets the time of a Date object to the end of the day (23:59:59.999).
 * @param date - The Date object to modify.
 */
function setEndOfDay(date: Date) {
    date.setHours(23, 59, 59, 999);
}

/**
 * Queries WIP data for the specified ClioID and date ranges.
 * @param ClioID - The ClioID to filter the data.
 * @param lastWeekStart - The start date of last week.
 * @param lastWeekEnd - The end date of last week.
 * @param currentWeekStart - The start date of the current week.
 * @param currentWeekEnd - The end date of the current week.
 * @param config - The SQL connection configuration.
 * @param context - The InvocationContext for logging.
 * @returns A promise that resolves to an array of WIP data records.
 */
async function queryWIPData(
    ClioID: number,
    lastWeekStart: Date,
    lastWeekEnd: Date,
    currentWeekStart: Date,
    currentWeekEnd: Date,
    config: any,
    context: InvocationContext
): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context.error("SQL Connection Error (WIP):", err);
            reject("An error occurred with the SQL connection.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context.error("SQL Connection Error (WIP):", err);
                reject("Failed to connect to SQL database.");
                return;
            }

            context.log("Successfully connected to SQL database (WIP).");

            const query = `
                SELECT user_id, date, SUM(quantity_in_hours) AS total_hours, SUM(total) AS total_amount
                FROM [dbo].[wip]
                WHERE user_id = @ClioID
                  AND (
                      (date >= @LastWeekStart AND date <= @LastWeekEnd)
                      OR
                      (date >= @CurrentWeekStart AND date <= @CurrentWeekEnd)
                  )
                GROUP BY user_id, date
                ORDER BY date ASC;
            `;

            context.log("SQL Query (WIP):", query);

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error (WIP):", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }
                context.log(`SQL query executed successfully (WIP). Rows returned: ${rowCount}`);
            });

            // Add parameters with correct types
            sqlRequest.addParameter("ClioID", TYPES.Int, ClioID); // number
            sqlRequest.addParameter("LastWeekStart", TYPES.Date, lastWeekStart); // Date object
            sqlRequest.addParameter("LastWeekEnd", TYPES.Date, lastWeekEnd); // Date object
            sqlRequest.addParameter("CurrentWeekStart", TYPES.Date, currentWeekStart); // Date object
            sqlRequest.addParameter("CurrentWeekEnd", TYPES.Date, currentWeekEnd); // Date object

            const results: { user_id: number; date: string; total_hours: number; total_amount: number }[] = [];

            sqlRequest.on("row", (columns) => {
                const result: any = {};
                columns.forEach((col) => {
                    result[col.metadata.colName] = col.value;
                });
                results.push(result);
            });

            sqlRequest.on("requestCompleted", () => {
                context.log("WIP Data Retrieved:", results);
                resolve(results);
                connection.close();
            });

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

/**
 * Structures the raw WIP data into the desired response format with short date strings.
 * @param wipData - The raw WIP data retrieved from the database.
 * @param lastWeekStart - The start date of last week.
 * @param lastWeekEnd - The end date of last week.
 * @param currentWeekStart - The start date of the current week.
 * @param currentWeekEnd - The end date of the current week.
 * @returns An object containing structured WIP data with short date strings.
 */
function structureResponse(
    wipData: { user_id: number; date: string; total_hours: number; total_amount: number }[],
    lastWeekStart: Date,
    lastWeekEnd: Date,
    currentWeekStart: Date,
    currentWeekEnd: Date
): any {
    const response = {
        current_week: {
            daily_data: {} as { [key: string]: { total_hours: number; total_amount: number } },
            daily_average: 0,
        },
        last_week: {
            daily_data: {} as { [key: string]: { total_hours: number; total_amount: number } },
            daily_average: 0,
        },
    };

    // Populate daily data with short date strings
    wipData.forEach((entry) => {
        const dateObj = new Date(entry.date);
        const dateStr = formatDateForSQL(dateObj); // Format to 'YYYY-MM-DD'

        if (isDateInRange(dateStr, lastWeekStart, lastWeekEnd)) {
            response.last_week.daily_data[dateStr] = {
                total_hours: entry.total_hours,
                total_amount: entry.total_amount,
            };
        } else if (isDateInRange(dateStr, currentWeekStart, currentWeekEnd)) {
            response.current_week.daily_data[dateStr] = {
                total_hours: entry.total_hours,
                total_amount: entry.total_amount,
            };
        }
    });

    // Calculate daily averages
    response.current_week.daily_average = calculateDailyAverage(response.current_week.daily_data, currentWeekStart, currentWeekEnd);
    response.last_week.daily_average = calculateDailyAverage(response.last_week.daily_data, lastWeekStart, lastWeekEnd);

    return response;
}

/**
 * Checks if a given date string is within the specified date range.
 * @param dateStr - The date string to check (format: 'YYYY-MM-DD').
 * @param startDate - The start date of the range.
 * @param endDate - The end date of the range.
 * @returns A boolean indicating whether the date is within the range.
 */
function isDateInRange(dateStr: string, startDate: Date, endDate: Date): boolean {
    const date = new Date(dateStr);
    return date >= startDate && date <= endDate;
}

/**
 * Calculates the daily average of total_hours, considering only Monday-Friday and excluding days with no data.
 * @param dailyData - An object containing daily WIP data.
 * @param weekStart - The start date of the week.
 * @param weekEnd - The end date of the week.
 * @returns The daily average as a number.
 */
function calculateDailyAverage(
    dailyData: { [key: string]: { total_hours: number; total_amount: number } },
    weekStart: Date,
    weekEnd: Date
): number {
    let total = 0;
    let count = 0;

    for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            // Skip Sundays and Saturdays
            continue;
        }
        const dateStr = formatDateForSQL(d); // Ensure 'YYYY-MM-DD' format
        if (dailyData[dateStr]) {
            total += dailyData[dateStr].total_hours;
            count += 1;
        }
    }

    return count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
}

/**
 * Formats a Date object to 'YYYY-MM-DD' string for SQL.
 * @param date - The Date object to format.
 * @returns A string in 'YYYY-MM-DD' format.
 */
function formatDateForSQL(date: Date): string {
    const year = date.getFullYear();
    const month = (`0${date.getMonth() + 1}`).slice(-2); // Months are zero-based
    const day = (`0${date.getDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
}

/**
 * Parses the SQL connection string into a configuration object for 'tedious'.
 * @param connectionString - The SQL connection string.
 * @param context - The InvocationContext for logging.
 * @returns A configuration object for establishing a SQL connection.
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
            default:
                break;
        }
    });

    return config;
}

export default app;
