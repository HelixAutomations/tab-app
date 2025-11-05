// src/functions/getPitchHistory.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

interface PitchData {
    EmailSubject: string;
    EmailBody?: string;
    EmailBodyHtml?: string;
    CreatedAt: string;
    CreatedBy: string;
}

export async function getPitchHistoryHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for getPitchHistory Azure Function.");

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*'
            },
            body: ''
        };
    }

    const enquiryId = req.params.enquiryId;

    if (!enquiryId) {
        context.warn("Missing 'enquiryId' in request parameters.");
        return {
            status: 400,
            body: JSON.stringify({ error: "Missing 'enquiryId' in request parameters." })
        };
    }

    try {
        context.log(`Initiating SQL query to retrieve pitch history for enquiry ID: ${enquiryId}`);
        const pitches = await queryPitchHistoryFromSQL(enquiryId, context);
        context.log("Successfully retrieved pitch history from SQL database.");

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            },
            body: JSON.stringify({ pitches })
        };
    } catch (error) {
        context.error("Error retrieving pitch history:", error);
        return {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: "Internal server error." })
        };
    }
}

async function queryPitchHistoryFromSQL(enquiryId: string, context: InvocationContext): Promise<PitchData[]> {
    return new Promise(async (resolve, reject) => {
        const keyVaultName = process.env.KEY_VAULT_NAME;
        if (!keyVaultName) {
            context.error("KEY_VAULT_NAME environment variable is not set.");
            return reject(new Error("KEY_VAULT_NAME not configured."));
        }

        const keyVaultUrl = `https://${keyVaultName}.vault.azure.net/`;
        const credential = new DefaultAzureCredential();
        const secretClient = new SecretClient(keyVaultUrl, credential);

        let dbServer: string;
        let dbName: string;
        let dbUser: string;
        let dbPassword: string;

        try {
            dbServer = (await secretClient.getSecret("dbServer")).value || "";
            dbName = (await secretClient.getSecret("dbName")).value || "";
            dbUser = (await secretClient.getSecret("dbUser")).value || "";
            dbPassword = (await secretClient.getSecret("dbPassword")).value || "";

            if (!dbServer || !dbName || !dbUser || !dbPassword) {
                throw new Error("One or more database secrets are missing.");
            }
        } catch (error) {
            context.error("Failed to retrieve secrets from Key Vault:", error);
            return reject(new Error("Failed to retrieve database secrets."));
        }

        const config = {
            server: dbServer,
            authentication: {
                type: "default" as const,
                options: {
                    userName: dbUser,
                    password: dbPassword,
                },
            },
            options: {
                database: dbName,
                encrypt: true,
                trustServerCertificate: false,
                connectTimeout: 30000,
                requestTimeout: 30000,
            },
        };

        const connection = new Connection(config);

        connection.on("connect", (err) => {
            if (err) {
                context.error("Error connecting to SQL Server:", err);
                return reject(err);
            }

            context.log("Connected to SQL Server. Executing pitch history query...");

            // Query to fetch pitch history for the given enquiry
            // Adjust table/column names based on your actual schema
            const query = `
                SELECT 
                    EmailSubject,
                    EmailBody,
                    EmailBodyHtml,
                    CreatedAt,
                    CreatedBy
                FROM PitchHistory
                WHERE EnquiryID = @enquiryId
                ORDER BY CreatedAt DESC
            `;

            const request = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("Error executing SQL query:", err);
                    connection.close();
                    return reject(err);
                }

                context.log(`Query executed successfully. Rows returned: ${rowCount}`);
                connection.close();
            });

            request.addParameter("enquiryId", TYPES.NVarChar, enquiryId);

            const pitches: PitchData[] = [];

            request.on("row", (columns) => {
                const pitch: PitchData = {
                    EmailSubject: columns[0]?.value || "",
                    EmailBody: columns[1]?.value || null,
                    EmailBodyHtml: columns[2]?.value || null,
                    CreatedAt: columns[3]?.value || "",
                    CreatedBy: columns[4]?.value || "",
                };
                pitches.push(pitch);
            });

            request.on("requestCompleted", () => {
                resolve(pitches);
            });

            connection.execSql(request);
        });

        connection.on("error", (err) => {
            context.error("Connection error:", err);
            reject(err);
        });

        connection.connect();
    });
}

// Register the function
app.http("getPitchHistory", {
    methods: ["GET", "OPTIONS"],
    authLevel: "anonymous",
    route: "pitches/{enquiryId}",
    handler: getPitchHistoryHandler,
});
