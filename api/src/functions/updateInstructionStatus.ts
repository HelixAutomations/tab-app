// src/functions/updateInstructionStatus.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";

// Define the interface for the request body
interface UpdateStatusBody {
    instructionRef: string;
    stage?: string;
    internalStatus?: string;
    overrideReason?: string;
    userInitials?: string;
}

// Define the handler function
export async function updateInstructionStatusHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for updateInstructionStatus Azure Function.");

    let body: UpdateStatusBody;

    try {
        body = await req.json() as UpdateStatusBody;
        context.log("Request body:", { 
            instructionRef: body.instructionRef, 
            stage: body.stage, 
            internalStatus: body.internalStatus,
            overrideReason: body.overrideReason,
            userInitials: body.userInitials
        });
    } catch (error) {
        context.error("Error parsing JSON body:", error);
        return {
            status: 400,
            body: "Invalid JSON format in request body."
        };
    }

    const { instructionRef, stage, internalStatus, overrideReason, userInitials } = body;

    if (!instructionRef || (!stage && !internalStatus)) {
        context.warn("Missing 'instructionRef' or both 'stage' and 'internalStatus' in request body.");
        return {
            status: 400,
            body: "Missing 'instructionRef' or status fields in request body."
        };
    }

    try {
        context.log("Initiating SQL query to update instruction status.");
        await updateStatusInSQL(instructionRef, stage, internalStatus, overrideReason, userInitials, context);
        context.log("Successfully updated instruction status in SQL database.");

        return {
            status: 200,
            body: JSON.stringify({ 
                success: true, 
                message: "Instruction status updated successfully.",
                instructionRef,
                stage,
                internalStatus,
                timestamp: new Date().toISOString()
            }),
            headers: { "Content-Type": "application/json" }
        };
    } catch (error) {
        context.error("Error updating instruction status:", error);
        return {
            status: 500,
            body: JSON.stringify({ 
                success: false, 
                error: typeof error === 'string' ? error : "Error updating instruction status." 
            }),
            headers: { "Content-Type": "application/json" }
        };
    } finally {
        context.log("Invocation completed for updateInstructionStatus Azure Function.");
    }
}

// Register the function
app.http("updateInstructionStatus", {
    methods: ["POST", "PUT"],
    authLevel: "function",
    handler: updateInstructionStatusHandler
});

// Implement the SQL update function
async function updateStatusInSQL(
    instructionRef: string, 
    stage?: string, 
    internalStatus?: string, 
    overrideReason?: string,
    userInitials?: string,
    context?: InvocationContext
): Promise<void> {
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "instructions-database-password";
    const sqlServer = "instructions.database.windows.net";
    const sqlDatabase = "instructions";

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=instructions;Password=${password};`;
    const config = parseConnectionString(connectionString, context);

    return new Promise<void>((resolve, reject) => {
        const connection = new Connection(config);

        connection.on("error", (err) => {
            context?.error("SQL Connection Error:", err);
            reject("An error occurred with the SQL connection.");
        });

        connection.on("connect", (err) => {
            if (err) {
                context?.error("SQL Connection Error:", err);
                reject("Failed to connect to SQL database.");
                return;
            }

            // Build dynamic update query based on provided fields
            const updateFields: string[] = [];
            const parameters: Array<{ name: string; type: any; value: any }> = [];

            if (stage) {
                updateFields.push("Stage = @Stage");
                parameters.push({ name: 'Stage', type: TYPES.NVarChar, value: stage });
            }

            if (internalStatus) {
                updateFields.push("InternalStatus = @InternalStatus");
                parameters.push({ name: 'InternalStatus', type: TYPES.NVarChar, value: internalStatus });
            }

            // Always update LastUpdated
            updateFields.push("LastUpdated = @LastUpdated");
            parameters.push({ name: 'LastUpdated', type: TYPES.DateTime, value: new Date() });

            // Add override reason if provided
            if (overrideReason) {
                updateFields.push("OverrideReason = @OverrideReason");
                parameters.push({ name: 'OverrideReason', type: TYPES.NVarChar, value: overrideReason });
            }

            // Add user initials if provided
            if (userInitials) {
                updateFields.push("LastModifiedBy = @LastModifiedBy");
                parameters.push({ name: 'LastModifiedBy', type: TYPES.NVarChar, value: userInitials });
            }

            const query = `
                UPDATE Instructions
                SET ${updateFields.join(', ')}
                WHERE InstructionRef = @InstructionRef
            `;

            parameters.push({ name: 'InstructionRef', type: TYPES.NVarChar, value: instructionRef });

            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context?.error("SQL Query Execution Error:", err);
                    reject("SQL query failed.");
                    connection.close();
                    return;
                }

                if (rowCount === 0) {
                    context?.warn(`No instruction found with reference: ${instructionRef}`);
                    reject(`No instruction found with the provided reference: ${instructionRef}`);
                } else {
                    context?.log(`Instruction ${instructionRef} status updated successfully.`);
                    resolve();
                }

                connection.close();
            });

            // Add all parameters to the request
            parameters.forEach(param => {
                sqlRequest.addParameter(param.name, param.type, param.value);
            });

            connection.execSql(sqlRequest);
        });

        connection.connect();
    });
}

// Helper function to parse SQL connection string
function parseConnectionString(connectionString: string, context?: InvocationContext): any {
    const parts = connectionString.split(';');
    const config: any = {};

    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (!key || !value) {
            return;
        }

        switch (key.trim()) {
            case 'Server':
                config.server = value;
                break;
            case 'Database':
                config.options = { ...config.options, database: value };
                break;
            case 'User ID':
                config.authentication = {
                    type: 'default',
                    options: { userName: value, password: '' }
                };
                break;
            case 'Password':
                if (!config.authentication) {
                    config.authentication = { type: 'default', options: { userName: '', password: '' } };
                }
                config.authentication.options.password = value;
                break;
            default:
                break;
        }
    });

    return config;
}

export default app;