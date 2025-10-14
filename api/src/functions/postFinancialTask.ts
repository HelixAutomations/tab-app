// invisible change 2
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { Connection, Request as SqlRequest, TYPES } from "tedious";
import fetch from "node-fetch";

// ------------------------------
// Interfaces and Helper Functions
// ------------------------------

interface RequestBody {
    formType: string;
    data: any;
    initials: string;
}

// Formats data into a neat label/value text description.
function formatDescription(data: Record<string, any>): string {
    let description = '';
    Object.entries(data).forEach(([key, value]: [string, any]) => {
      description += `${key}: ${value}\n`;
    });
    return description.trim();
  }

// Sanitises data by logging file details and replacing file content with the file name.
function sanitizeDataForTask(data: any, context: InvocationContext): any {
    const sanitised = { ...data };
    for (const key in sanitised) {
        if (sanitised.hasOwnProperty(key)) {
            const value = sanitised[key];
            // Check if this looks like a file object (has fileName and either fileContent or base64)
            if (value && typeof value === 'object' && 'fileName' in value) {
                if (value.fileContent || value.base64) {
                    context.log(`Sanitise - File uploaded in field "${key}": Name: ${value.fileName}`);
                    sanitised[key] = value.fileName;
                } else {
                    context.log(`Sanitise - File object found in field "${key}" but missing content: Name: ${value.fileName}`);
                    sanitised[key] = `${value.fileName} (file content missing)`;
                }
            }
        }
    }
    return sanitised;
}

// Parses a SQL connection string into configuration for the 'tedious' library.
function parseConnectionString(connectionString: string, context: InvocationContext): any {
    const parts = connectionString.split(';');
    const config: any = {};
    parts.forEach(part => {
        const [key, value] = part.split('=');
        if (!key || !value) return;
        switch (key.trim()) {
            case 'Server':
                config.server = value;
                break;
            case 'Database':
                config.options = { ...config.options, database: value };
                break;
            case 'User ID':
                config.authentication = { type: 'default', options: { userName: value, password: '' } };
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
    config.options.encrypt = true;
    config.options.enableArithAbort = true;
    context.log("Parsed SQL configuration:", config);
    return config;
}

// Retrieves ASANA credentials from SQL using the team's initials.
async function getAsanaCredentials(initials: string, context: InvocationContext): Promise<{ 
    ASANAClientID: string, 
    ASANASecret: string, 
    ASANARefreshToken: string,
    ASANAUserID: string 
} | null> {
    context.log(`Fetching ASANA credentials for initials: ${initials}`);
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    let password: string | undefined;
    try {
        context.log(`Retrieving SQL password secret: ${passwordSecretName} from Key Vault at ${kvUri}`);
        const passwordSecret = await secretClient.getSecret(passwordSecretName);
        password = passwordSecret.value;
        if (!password) {
            context.error(`Password not found in Key Vault secret: ${passwordSecretName}`);
            return null;
        }
        context.log("SQL password retrieved successfully.");
    } catch (error) {
        context.error("Error fetching SQL password from Key Vault:", error);
        return null;
    }
    const sqlServer = "helix-database-server.database.windows.net";
    const sqlDatabase = "helix-core-data";
    const connectionString = `Server=${sqlServer};Database=${sqlDatabase};User ID=helix-database-server;Password=${password};`;
    const config = parseConnectionString(connectionString, context);
    return new Promise((resolve, reject) => {
        const connection = new Connection(config);
        connection.on("error", (err) => {
            context.error("SQL Connection Error in getAsanaCredentials:", err);
            reject(err);
        });
        connection.on("connect", (err) => {
            if (err) {
                context.error("Failed to connect to SQL database in getAsanaCredentials:", err);
                reject(err);
                return;
            }
            context.log("Connected to SQL database for ASANA credentials.");
            const query = `
                SELECT [ASANAClient_ID], [ASANASecret], [ASANARefreshToken], [ASANAUser_ID]
                FROM [dbo].[team]
                WHERE UPPER([Initials]) = @Initials
            `;
            const sqlRequest = new SqlRequest(query, (err, rowCount) => {
                if (err) {
                    context.error("SQL Query Execution Error in getAsanaCredentials:", err);
                    reject(err);
                    connection.close();
                    return;
                }
                if (rowCount === 0) {
                    context.warn(`No team member found with initials: ${initials}`);
                }
            });
            let result: { 
                ASANAClientID: string, 
                ASANASecret: string, 
                ASANARefreshToken: string,
                ASANAUserID: string 
            } | null = null;
            sqlRequest.on("row", (columns) => {
                result = {
                    ASANAClientID: columns[0].value,
                    ASANASecret: columns[1].value,
                    ASANARefreshToken: columns[2].value,
                    ASANAUserID: columns[3].value,
                };
                context.log("SQL row received for ASANA credentials:", result);
            });
            sqlRequest.on("requestCompleted", () => {
                connection.close();
                if (result) {
                    context.log(`ASANA credentials retrieved for initials: ${initials}`);
                } else {
                    context.warn(`No ASANA credentials found for initials: ${initials}`);
                }
                resolve(result);
            });
            sqlRequest.addParameter("Initials", TYPES.NVarChar, initials.toUpperCase());
            connection.execSql(sqlRequest);
        });
        connection.connect();
    });
}

// ------------------------------
// Microsoft Graph: OneDrive Integration
// ------------------------------

// Retrieves a Microsoft Graph access token using client credentials flow. 
async function getGraphAccessToken(context: InvocationContext): Promise<string> {
    context.log("Starting getGraphAccessToken with hard-coded env values.");
    const graphClientIdSecretName = "graph-aidenteams-clientid";
    const graphClientSecretSecretName = "graph-aiden-teamhub-financialattachments-clientsecret";
    const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";
    const kvUri = "https://helix-keys.vault.azure.net/";
    context.log(`Graph Auth - Using secret names: ${graphClientIdSecretName}, ${graphClientSecretSecretName} and Tenant ID: ${tenantId}`);
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    context.log(`Fetching Graph client ID from Key Vault using secret name: ${graphClientIdSecretName}`);
    const clientIdSecret = await secretClient.getSecret(graphClientIdSecretName);
    context.log("Graph client ID retrieved successfully.");
    context.log(`Fetching Graph client secret from Key Vault using secret name: ${graphClientSecretSecretName}`);
    const clientSecretSecret = await secretClient.getSecret(graphClientSecretSecretName);
    context.log("Graph client secret retrieved successfully.");
    const clientId = clientIdSecret.value;
    const clientSecret = clientSecretSecret.value;
    if (!clientId || !clientSecret) {
        context.error("Graph client credentials not found in Key Vault.");
        throw new Error("Missing Graph client credentials.");
    }
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    context.log("Graph token URL:", tokenUrl);
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("client_secret", clientSecret);
    params.append("grant_type", "client_credentials");
    context.log("Requesting Graph access token with parameters:", params.toString());
    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    });
    if (!response.ok) {
        const errorText = await response.text();
        context.error("Failed to obtain Graph token:", errorText);
        throw new Error("Graph token request failed.");
    }
    const tokenData = await response.json();
    context.log("Graph access token retrieved successfully.");
    return tokenData.access_token;
}

// Creates an organization-wide sharing link (view-type, scope: organization) for a file.
async function createOrgWideLink(
    accessToken: string,
    driveId: string,
    itemId: string,
    context: InvocationContext
): Promise<string> {
    context.log(`Creating an organization-wide sharing link for itemId "${itemId}" on drive "${driveId}"`);
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/createLink`;
    const payload = {
        type: "view",       // You can choose "edit", "view", etc.
        scope: "organization"
    };
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorText = await response.text();
        context.error("Failed to create sharing link:", errorText);
        throw new Error("Sharing link creation failed.");
    }
    const result = await response.json();
    context.log("Sharing link created successfully:", result);
    return result.link && result.link.webUrl ? result.link.webUrl : "";
}

// Uploads a file to OneDrive into the specified subfolder (targetFolderId) within the Automations user's drive.
// It decodes the base64 data (or fileContent if provided) into binary then sends that binary in the PUT request.
async function uploadFileToOneDrive(
    accessToken: string,
    driveId: string,
    folderId: string,
    fileName: string,
    fileContentBase64: string,
    context: InvocationContext
): Promise<any> {
    context.log(`Uploading file "${fileName}" to folderId "${folderId}" in drive "${driveId}"`);
    // Remove any prefix from the base64 string, e.g. "data:image/png;base64,"
    const commaIndex = fileContentBase64.indexOf(",");
    if (commaIndex > -1) {
        fileContentBase64 = fileContentBase64.substring(commaIndex + 1);
    }
    // Decode the base64 string to binary.
    const fileBuffer = Buffer.from(fileContentBase64, "base64");
    // Construct the upload URL using the folder ID and file name.
    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;
    context.log("Upload URL:", uploadUrl);
    const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/octet-stream"
        },
        body: fileBuffer  // Send raw binary content.
    });
    if (!response.ok) {
        const errorText = await response.text();
        context.error("Failed to upload file to OneDrive:", errorText);
        throw new Error("OneDrive file upload failed.");
    }
    const result = await response.json();
    context.log("File uploaded successfully:", result);
    return result;
}

// ------------------------------
// Main Azure Function Handler
// ------------------------------

export async function postFinancialTaskHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for postFinancialTask Azure Function.");
    try {
        // Parse and validate the request body.
        context.log("Parsing request body.");
        const payload = await req.json() as RequestBody;
        const { formType, data, initials } = payload;
        if (!formType || !data || !initials) {
            context.warn("Missing formType, data, or initials in request body.");
            return {
                status: 400,
                body: JSON.stringify({ error: "Missing formType, data, or initials in the request body." })
            };
        }
        context.log(`Request details - Form Type: ${formType}, Initials: ${initials}`);
        
        // Fetch ASANA credentials (and user's ASANA ID) based on the initials.
        const asanaCredentials = await getAsanaCredentials(initials, context);
        if (!asanaCredentials) {
            context.warn(`ASANA credentials not found for initials: ${initials}`);
            return {
                status: 400,
                body: JSON.stringify({ error: "ASANA credentials not found for the provided initials." })
            }; 
        }
        const { ASANAClientID, ASANASecret, ASANARefreshToken, ASANAUserID } = asanaCredentials;
        context.log("ASANA credentials obtained:", { ASANAClientID, ASANAUserID });
        
        // Refresh the Asana token.
        context.log("Refreshing Asana token.");
        const tokenUrl = `https://app.asana.com/-/oauth_token?grant_type=refresh_token&client_id=${encodeURIComponent(ASANAClientID)}&client_secret=${encodeURIComponent(ASANASecret)}&refresh_token=${encodeURIComponent(ASANARefreshToken)}`;
        const tokenResponse = await fetch(tokenUrl, { method: "POST" });
        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            context.error("Token refresh failed:", errorText);
            throw new Error("Failed to refresh Asana token.");
        }
        const tokenData = await tokenResponse.json();
        const accessTokenAsana: string = tokenData.access_token;
        context.log("Asana token refreshed successfully.");
        
        // Sanitise and format data for the task description.
        context.log("Sanitising data for task description.");
        const sanitisedData = sanitizeDataForTask(data, context);
        let description = formatDescription(sanitisedData);
        context.log("Initial task description:", description);

        // ───────────────────────────────────────────────────
        // Append the two extra messages per your colleague’s brief
        // ───────────────────────────────────────────────────
        if (
          formType === "Payment Requests" &&
          data["Is the amount you are sending over £50k"] === true
        ) {
          description += "\n\nPlease note we will need to perform an extra verification check. Accounts will send a small random amount and a random reference to the payee. You will need to ask them to confirm the amount and reference used before accounts can make the remaining balancing payment.";
          context.log("Appended >£50k verification note to description.");
        }

        if (
          formType === "Supplier Payment/Helix Expense" &&
          data["Payment Type"] === "CHAPS (same day over £1m)"
        ) {
          description += "\n\nFor accounts/ whoever making payment - Please refer to this guide https://app.nuclino.com/Helix-Law-Limited/Team-Helix/CHAPS-Same-Day-Purpose-Codes-bc03cd9f-117c-4061-83a1-bdf18bd88072";
          context.log("Appended CHAPS guide note to description.");
        }

        // ------------------------------
        // OneDrive Integration using Microsoft Graph.
        // ------------------------------
        const formFolderMapping: { [key: string]: string } = {
            "Payment Requests": "01SHVNVKRYLIPQGFSEVVDIOKCA6LR3LVFU",
            "Supplier Payment/Helix Expense": "01SHVNVKRFJFPCEFOND5C2PJMBMFYWAY7Y",
            "Transfer Request":   "01SHVNVKQXD7PIEWD7W5C2JRE3SJR5FYTC",
            "General Query":      "01SHVNVKSAMI5BILLCIRGIQV67ONCUBBNF"
        };
        
        // Different forms use different field names for file uploads
        const fileFieldMapping: { [key: string]: string } = {
            "Payment Requests": "Disbursement Upload",
            "Supplier Payment/Helix Expense": "Invoice Upload", 
            "General Query": "Attachments"
        };
        
        const targetFolderId = formFolderMapping[formType];
        const fileFieldName = fileFieldMapping[formType];
        
        if (targetFolderId && fileFieldName) {
            if (
                data[fileFieldName] &&
                typeof data[fileFieldName] === 'object'
            ) {
                const fileData = data[fileFieldName];
                context.log(`File upload data received for field "${fileFieldName}":`, JSON.stringify(fileData, null, 2));
                
                // Check if we have all required properties
                if (fileData.fileName && fileData.fileType && (fileData.fileContent || fileData.base64)) {
                    const fileName = fileData.fileName;
                    const fileContentBase64 = fileData.fileContent || fileData.base64;
                    context.log(`Uploading attachment "${fileName}" from field "${fileFieldName}" for form type "${formType}" to OneDrive folder.`);
                    
                    try {
                        const graphAccessToken = await getGraphAccessToken(context);
                        const driveId = "b!Yvwb2hcQd0Sccr_JiZEOOEqq1HfNiPFCs8wM4QfDlvVbiAZXWhpCS47xKdZKl8Vd";
                        const uploadResult = await uploadFileToOneDrive(graphAccessToken, driveId, targetFolderId, fileName, fileContentBase64, context);
                        if (uploadResult && uploadResult.id) {
                            const sharingLink = await createOrgWideLink(graphAccessToken, driveId, uploadResult.id, context);
                            if (sharingLink) {
                                description += `\nUploaded File: ${uploadResult.name}\nLink: ${sharingLink}`;
                                context.log("Updated task description with file link:", description);
                            } else {
                                context.warn("Sharing link not created; file link not appended.");
                            }
                        } else {
                            context.warn("Upload result did not contain an ID; file link not appended.");
                        }
                    } catch (uploadError) {
                        context.error("Failed to upload file to OneDrive:", uploadError);
                        // Continue with task creation even if file upload fails
                    }
                } else {
                    // Log detailed debugging information
                    context.log(`Attachment data validation failed for field "${fileFieldName}":`);
                    context.log(`- fileName present: ${!!fileData.fileName} (value: "${fileData.fileName || 'undefined'}")`);
                    context.log(`- fileType present: ${!!fileData.fileType} (value: "${fileData.fileType || 'undefined'}")`);  
                    context.log(`- fileContent present: ${!!fileData.fileContent}`);
                    context.log(`- base64 present: ${!!fileData.base64}`);
                    context.log("Available properties:", Object.keys(fileData));
                    context.log("Skipping file upload due to missing required properties.");
                    
                    // If we have at least a fileName, mention it in the task description
                    if (fileData.fileName) {
                        description += `\nFile mentioned: ${fileData.fileName} (upload failed - missing file data)`;
                    }
                }
            } else {
                context.log(`No file upload data found in field "${fileFieldName}".`);
            }
        } else if (!targetFolderId) {
            context.log(`No OneDrive folder mapping found for form type: ${formType}. Skipping file upload.`);
        } else if (!fileFieldName) {
            context.log(`No file field mapping found for form type: ${formType}. Skipping file upload.`);
        }

        // Build task details for Asana using the updated description.
        const matterRef = data["Matter Reference"];
        const finalTaskName = matterRef ? `${matterRef} - ${formType}` : formType;
        const today = new Date();
        const dueOn = today.toISOString().split("T")[0];
        const taskBody: any = {
            data: {
                projects: ["1203336124217593"],
                name: finalTaskName,
                notes: description,
                due_on: dueOn,
            }
        };
        if (data["Tag me as Collaborator"]) {
            taskBody.data.followers = [ASANAUserID];
        }
        context.log("Creating Asana task with payload:", JSON.stringify(taskBody));
        const asanaResponse = await fetch("https://app.asana.com/api/1.0/tasks", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessTokenAsana}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(taskBody),
        });
        if (!asanaResponse.ok) {
            const errText = await asanaResponse.text();
            context.error("Failed to create Asana task:", errText);
            throw new Error("Asana task creation failed.");
        }
        const asanaResult = await asanaResponse.json();
        context.log("Asana task created successfully:", asanaResult);
        
        return {
            status: 200,
            body: JSON.stringify({ message: "Task created and OneDrive upload completed (if applicable).", asanaTask: asanaResult }),
        };
        
    } catch (error: any) {
        context.error("Error in postFinancialTaskHandler:", error);
        return {
            status: 500,
            body: JSON.stringify({ error: error.message || "Unknown error occurred." }),
        };
    } finally {
        context.log("Invocation completed for postFinancialTask Azure Function.");
    }
}

export default app.http("postFinancialTask", {
    methods: ["POST"],
    authLevel: "function",
    handler: postFinancialTaskHandler,
});
