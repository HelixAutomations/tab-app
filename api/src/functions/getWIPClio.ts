// src/functions/getWIPClio.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import fetch from "node-fetch"; // Ensure node-fetch is installed
import { URL, URLSearchParams } from "url";

// Define the expected structure of the request body
interface GetMonthlyWIPRequest {
    ClioID: number;
}

// Interface for Clio OAuth token response
interface ClioTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

// Interface for Clio Activity
interface ClioActivity {
    quantity_in_hours: number;
    total: number;
    date: string;
}

// Interface for structured response
interface StructuredResponse {
    current_week: {
        daily_data: Record<string, { total_hours: number; total_amount: number }>;
        daily_average: number;
    };
    last_week: {
        daily_data: Record<string, { total_hours: number; total_amount: number }>;
        daily_average: number;
    };
}

export async function getMonthlyWIPHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getMonthlyWIP Azure Function.");

    const kvUri = "https://helix-keys.vault.azure.net/";
    const clioRefreshTokenSecretName = "clio-pbi-refreshtoken";
    const clioSecretName = "clio-pbi-secret";
    const clioClientIdSecretName = "clio-pbi-clientid";
    const clioTokenUrl = "https://eu.app.clio.com/oauth/token";
    const clioActivitiesUrl = "https://eu.app.clio.com/api/v4/activities.json";

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

        // Retrieve Clio OAuth credentials from Key Vault
        const credential = new DefaultAzureCredential();
        const secretClient = new SecretClient(kvUri, credential);

        const [refreshTokenSecret, clientSecret, clientIdSecret] = await Promise.all([
            secretClient.getSecret(clioRefreshTokenSecretName),
            secretClient.getSecret(clioSecretName),
            secretClient.getSecret(clioClientIdSecretName),
        ]);

        const refreshToken = refreshTokenSecret.value;
        const clientSecretValue = clientSecret.value;
        const clientId = clientIdSecret.value;

        if (!refreshToken || !clientSecretValue || !clientId) {
            context.log("One or more Clio OAuth credentials are missing.");
            return {
                status: 500,
                body: JSON.stringify({ error: "Clio OAuth credentials are missing." })
            };
        }

        context.log("Retrieved Clio OAuth credentials from Key Vault.");

        // Obtain Access Token from Clio
        const accessToken = await getClioAccessToken(clioTokenUrl, clientId, clientSecretValue, refreshToken, context);

        context.log("Obtained Clio access token.");

        // Calculate date ranges
        const { startDate, endDate } = getDateRanges(new Date());

        context.log(`Date Range - Start: ${startDate}, End: ${endDate}`);

        // Fetch Activities from Clio
        const activities = await fetchClioActivities(
            clioActivitiesUrl,
            ClioID,
            startDate,
            endDate,
            accessToken,
            context
        );

        context.log(`Fetched ${activities.length} activities from Clio.`);

        // Structure the response
        const response: StructuredResponse = structureResponse(activities, startDate, endDate);

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

app.http("getWIPClio", {
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
 * Obtains an access token from Clio using OAuth refresh token.
 * @param tokenUrl - The Clio OAuth token endpoint URL.
 * @param clientId - The Clio OAuth client ID.
 * @param clientSecret - The Clio OAuth client secret.
 * @param refreshToken - The Clio OAuth refresh token.
 * @param context - The InvocationContext for logging.
 * @returns A promise that resolves to the access token string.
 */
async function getClioAccessToken(
    tokenUrl: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    context: InvocationContext
): Promise<string> {
    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });

    const response = await fetch(`${tokenUrl}?${params.toString()}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        context.error("Failed to obtain Clio access token:", errorBody);
        throw new Error("Failed to obtain Clio access token.");
    }

    const tokenData: ClioTokenResponse = await response.json();
    return tokenData.access_token;
}

/**
 * Calculates the start date of the previous week (Monday) and today.
 * @param referenceDate - The date to calculate the range based on.
 * @returns An object containing startDate and endDate in 'YYYY-MM-DD' format.
 */
function getDateRanges(referenceDate: Date): { startDate: string; endDate: string } {
    const startDateObj = getPreviousMonday(referenceDate);
    const startDate = formatDateForClio(startDateObj);
    const endDate = formatDateForClio(referenceDate);
    return { startDate, endDate };
}

/**
 * Returns the Monday of the previous week for the given date.
 * @param d - The reference date.
 * @returns A Date object representing the previous week's Monday.
 */
function getPreviousMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Adjust when day is Sunday
    date.setDate(date.getDate() + diff - 7); // Previous week
    setStartOfDay(date);
    return date;
}

/**
 * Sets the time of a Date object to the start of the day (00:00:00.000).
 * @param date - The Date object to modify.
 */
function setStartOfDay(date: Date): void {
    date.setHours(0, 0, 0, 0);
}

/**
 * Formats a Date object to 'YYYY-MM-DD' string for Clio API.
 * @param date - The Date object to format.
 * @returns A string in 'YYYY-MM-DD' format.
 */
function formatDateForClio(date: Date): string {
    const year = date.getFullYear();
    const month = (`0${date.getMonth() + 1}`).slice(-2); // Months are zero-based
    const day = (`0${date.getDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
}

/**
 * Fetches all activities from Clio API, handling pagination.
 * @param activitiesUrl - The Clio activities endpoint URL.
 * @param userId - The ClioID to filter activities.
 * @param startDate - The start date in 'YYYY-MM-DD' format.
 * @param endDate - The end date in 'YYYY-MM-DD' format.
 * @param accessToken - The Clio API access token.
 * @param context - The InvocationContext for logging.
 * @returns A promise that resolves to an array of ClioActivity objects.
 */
async function fetchClioActivities(
    activitiesUrl: string,
    userId: number,
    startDate: string,
    endDate: string,
    accessToken: string,
    context: InvocationContext
): Promise<ClioActivity[]> {
    let allActivities: ClioActivity[] = [];
    let nextPageUrl: string | null = null;

    // Initial URL with query parameters
    const initialUrl = new URL(activitiesUrl);
    const params = new URLSearchParams({
        user_id: userId.toString(),
        start_date: startDate,
        end_date: endDate,
        limit: "200",
        order: "date(asc)",
        fields: "quantity_in_hours,total,date",
    });
    initialUrl.search = params.toString();
    nextPageUrl = initialUrl.toString();

    while (nextPageUrl) {
        context.log(`Fetching activities from Clio: ${nextPageUrl}`);
        const response = await fetch(nextPageUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorBody = await response.text();
            context.error("Failed to fetch activities from Clio:", errorBody);
            throw new Error("Failed to fetch activities from Clio.");
        }

        const data: {
            meta: {
                paging: {
                    next?: string;
                };
                records: number;
            };
            data: ClioActivity[];
        } = await response.json();

        if (data.data && Array.isArray(data.data)) {
            allActivities = allActivities.concat(data.data as ClioActivity[]);
        }

        // Check for pagination
        if (data.meta && data.meta.paging && data.meta.paging.next) {
            nextPageUrl = data.meta.paging.next;
        } else {
            nextPageUrl = null;
        }
    }

    return allActivities;
}

/**
 * Structures the raw Clio activities data into the desired response format with short date strings.
 * @param activities - The raw activities data retrieved from Clio.
 * @param startDate - The start date of the range.
 * @param endDate - The end date of the range.
 * @returns An object containing structured WIP data with short date strings.
 */
function structureResponse(
    activities: ClioActivity[],
    startDate: string,
    endDate: string
): StructuredResponse {
    const { lastWeekStart, lastWeekEnd, currentWeekStart, currentWeekEnd } = getWeekDateRanges(new Date(endDate));

    const response: StructuredResponse = {
        current_week: {
            daily_data: {},
            daily_average: 0,
        },
        last_week: {
            daily_data: {},
            daily_average: 0,
        },
    };

    // Populate daily data
    activities.forEach((activity) => {
        const { date, quantity_in_hours, total } = activity;
        if (isDateInRange(date, lastWeekStart, lastWeekEnd)) {
            if (!response.last_week.daily_data[date]) {
                response.last_week.daily_data[date] = { total_hours: 0, total_amount: 0 };
            }
            response.last_week.daily_data[date].total_hours += quantity_in_hours;
            response.last_week.daily_data[date].total_amount += total;
        } else if (isDateInRange(date, currentWeekStart, currentWeekEnd)) {
            if (!response.current_week.daily_data[date]) {
                response.current_week.daily_data[date] = { total_hours: 0, total_amount: 0 };
            }
            response.current_week.daily_data[date].total_hours += quantity_in_hours;
            response.current_week.daily_data[date].total_amount += total;
        }
    });

    // Calculate daily averages
    response.current_week.daily_average = calculateDailyAverage(response.current_week.daily_data, currentWeekStart, currentWeekEnd);
    response.last_week.daily_average = calculateDailyAverage(response.last_week.daily_data, lastWeekStart, lastWeekEnd);

    return response;
}

/**
 * Calculates the start and end dates for the current and last weeks based on a reference date.
 * Assumes weeks start on Monday and end on Sunday.
 * @param referenceDate - The reference date to calculate weeks.
 * @returns An object containing the start and end dates for the current and last weeks.
 */
function getWeekDateRanges(referenceDate: Date): {
    lastWeekStart: Date;
    lastWeekEnd: Date;
    currentWeekStart: Date;
    currentWeekEnd: Date;
} {
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

    return { lastWeekStart, lastWeekEnd, currentWeekStart, currentWeekEnd };
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
 * Sets the time of a Date object to the end of the day (23:59:59.999).
 * @param date - The Date object to modify.
 */
function setEndOfDay(date: Date): void {
    date.setHours(23, 59, 59, 999);
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
    dailyData: Record<string, { total_hours: number; total_amount: number }>,
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
        const dateStr = formatDateForClio(d); // Ensure 'YYYY-MM-DD' format
        if (dailyData[dateStr]) {
            total += dailyData[dateStr].total_hours;
            count += 1;
        }
    }

    return count > 0 ? parseFloat((total / count).toFixed(2)) : 0;
}

export default app;
