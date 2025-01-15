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

// Format data into a neat label/value text description
function formatDescription(data: any): string {
  let description = '';
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      description += `${key}: ${data[key]}\n`;
    }
  }
  return description.trim();
}

// Sanitise data: log file details and replace file contents with just file name in the description.
// The full file data remains in the payload (for further processing, like sending as an attachment).
function sanitizeDataForTask(data: any, context: InvocationContext): any {
    const sanitised = { ...data };
    for (const key in sanitised) {
        if (sanitised.hasOwnProperty(key)) {
            const value = sanitised[key];
            // Check if value represents an uploaded file
            if (value && typeof value === 'object' && 'fileName' in value && 'fileContent' in value) {
                context.log(`Sanitise - File uploaded in field "${key}": Name: ${value.fileName}, Contents: ${value.fileContent}`);
                // Replace file content with just the file name for the task description
                sanitised[key] = value.fileName;
            }
        }
    }
    return sanitised;
}

// Parse SQL connection string into configuration for the 'tedious' library
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

    // For secure Azure SQL connections
    config.options.encrypt = true;
    config.options.enableArithAbort = true;
    context.log("Parsed SQL configuration:", config);
    return config;
}

// Retrieve ASANA credentials from SQL using the team's initials
async function getAsanaCredentials(initials: string, context: InvocationContext): Promise<{ 
    ASANAClientID: string, 
    ASANASecret: string, 
    ASANARefreshToken: string,
    ASANAUserID: string 
} | null> {
    context.log(`Fetching ASANA credentials for initials: ${initials}`);

    // Azure Key Vault details
    const kvUri = "https://helix-keys.vault.azure.net/"; // Replace with your Key Vault URI
    const passwordSecretName = "sql-databaseserver-password"; // Replace with your secret name

    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    let password: string | undefined;

    try {
        context.log(`Attempting to retrieve SQL password secret: ${passwordSecretName} from Key Vault at ${kvUri}`);
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

    const sqlServer = "helix-database-server.database.windows.net"; // Replace as needed
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
// Microsoft Graph: Email Integration
// ------------------------------

// Retrieves a Microsoft Graph access token using client credentials flow.
// The values below are hard-coded for this function so that we no longer depend on env variables.
async function getGraphAccessToken(context: InvocationContext): Promise<string> {
    context.log("Starting getGraphAccessToken with hard-coded env values.");

    // Hard-coded secret names and tenant ID – these will be used to query Key Vault.
    const graphClientIdSecretName = "graph-pitchbuilderemailprovider-clientid";
    const graphClientSecretSecretName = "graph-pitchbuilderemailprovider-clientsecret";
    const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";
    const kvUri = "https://helix-keys.vault.azure.net/";

    context.log(`Graph Auth - Using secret names: ${graphClientIdSecretName}, ${graphClientSecretSecretName} and Tenant ID: ${tenantId}`);

    // Retrieve the actual client ID and secret from Key Vault.
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

// Sends an email with an optional file attachment via Microsoft Graph.
// The attachment is constructed from the provided file data.
async function sendEmailWithAttachment(accessToken: string, subject: string, bodyContent: string, attachmentData: any, context: InvocationContext): Promise<void> {
    context.log("Preparing to send email via Microsoft Graph.");
    const emailPayload: any = {
        message: {
            subject: subject,
            body: {
                contentType: "Text",
                content: bodyContent,
            },
            toRecipients: [
                {
                    emailAddress: { address: "lz@helix-law.com" }
                }
            ],
            attachments: []
        }
    };

    if (attachmentData && attachmentData.fileName && attachmentData.base64 && attachmentData.fileType) {
        context.log("Attachment detected. Processing attachment details.");
        let base64Content = attachmentData.base64;
        const commaIndex = base64Content.indexOf(",");
        if (commaIndex > -1) {
            base64Content = base64Content.substring(commaIndex + 1);
        }
        emailPayload.message.attachments.push({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: attachmentData.fileName,
            contentBytes: base64Content,
            contentType: attachmentData.fileType
        });
    }
    context.log("Email payload constructed:", JSON.stringify(emailPayload));

    const sendMailUrl = "https://graph.microsoft.com/v1.0/users/lz@helix-law.com/sendMail";
    context.log("Sending email via Graph at URL:", sendMailUrl);

    const response = await fetch(sendMailUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
        const errText = await response.text();
        context.error("Failed to send email:", errText);
        throw new Error("Graph email sending failed.");
    }
    context.log("Email sent successfully to lz@helix-law.com.");
}

// ------------------------------
// Main Azure Function Handler
// ------------------------------

export async function postFinancialTaskHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for postFinancialTask Azure Function.");

    try {
        // Parse and validate the request body
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

        // Fetch ASANA credentials (and user's ASANA ID) based on the user's initials
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

        // Refresh the Asana token
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

        // Sanitise the data (replace full attachment content with file name in description)
        context.log("Sanitising data for task description.");
        const sanitisedData = sanitizeDataForTask(data, context);
        const description = formatDescription(sanitisedData);
        context.log("Formatted task description:", description);

        // Build task details
        const matterRef = data["Matter Reference"];
        const taskName = matterRef ? `${matterRef} - ${formType}` : formType;
        const today = new Date();
        const dueOn = today.toISOString().split("T")[0];

        const taskBody: any = {
            data: {
                projects: ["1203336124217593"], // Replace with your actual project ID
                name: taskName,
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

        // ------------------------------
        // Email Integration using Microsoft Graph
        // ------------------------------
        context.log("Starting Microsoft Graph email integration.");
        const graphAccessToken = await getGraphAccessToken(context);
        context.log("Graph access token obtained.");

        const emailSubject = `New ${formType} Received`;
        const emailBody = `A new financial form has been submitted:\n\n${description}`;
        context.log("Preparing email. Subject:", emailSubject);

        let attachment: any = null;
        if (data["Disbursement Upload"] && typeof data["Disbursement Upload"] === 'object') {
            attachment = data["Disbursement Upload"];
            context.log("Attachment found in request data.");
        }

        await sendEmailWithAttachment(graphAccessToken, emailSubject, emailBody, attachment, context);
        context.log("Microsoft Graph email integration completed.");

        return {
            status: 200,
            body: JSON.stringify({ message: "Task created and email sent successfully.", asanaTask: asanaResult }),
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

// Register the function with Azure Functions
export default app.http("postFinancialTask", {
    methods: ["POST"],
    authLevel: "function",
    handler: postFinancialTaskHandler,
});
