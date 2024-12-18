// src/functions/sendEmail.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import axios from "axios";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

interface RequestBody {
    email_contents: string;
    user_email: string;
}

interface EmailResponse {
    success: boolean;
    message?: string;
    error?: string;
}

async function sendEmailWithGraph(
    email_contents: string,
    user_email: string,
    context: InvocationContext
): Promise<EmailResponse> {
    context.log("--- Function sendEmailWithGraph Invoked ---");
    context.log(`Received user_email: ${user_email}`);
    context.log(`Received email_contents length: ${email_contents.length}`);

    try {
        const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";

        const kvUri = "https://helix-keys.vault.azure.net/";
        const clientIdSecretName = "graph-pitchbuilderemailprovider-clientid";
        const clientSecretName = "graph-pitchbuilderemailprovider-clientsecret";

        context.log("Initializing Key Vault client with DefaultAzureCredential...");
        const credential = new DefaultAzureCredential();
        const secretClient = new SecretClient(kvUri, credential);
        context.log("Key Vault client initialized successfully.");

        context.log("Fetching clientId from Key Vault...");
        const clientIdSecret = await secretClient.getSecret(clientIdSecretName);
        const clientId = clientIdSecret.value;
        context.log("clientId fetched successfully.");

        context.log("Fetching clientSecret from Key Vault...");
        const clientSecretSecret = await secretClient.getSecret(clientSecretName);
        const clientSecret = clientSecretSecret.value;
        context.log("clientSecret fetched successfully.");

        if (!clientId || !clientSecret) {
            context.error("One or more secrets (clientId, clientSecret) are missing from Key Vault.");
            throw new Error("Missing secrets: clientId or clientSecret.");
        }
        context.log("All required secrets are present.");

        context.log("Fetching access token from Microsoft Graph...");
        const tokenResponse = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                scope: "https://graph.microsoft.com/.default",
                grant_type: "client_credentials",
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        context.log("Access token response received from Microsoft Graph.");

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            context.error("Access token is undefined or null.");
            throw new Error("Failed to retrieve access token.");
        }
        context.log("Access token retrieved successfully.");

        const emailContent = {
            message: {
                subject: "Your Enquiry from Helix",
                body: {
                    contentType: "HTML",
                    content: email_contents,
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: user_email,
                        },
                    },
                ],
                from: {
                    emailAddress: {
                        address: "automations@helix-law.com",
                    },
                },
            },
            saveToSentItems: "false",
        };
        context.log("Prepared email content for Microsoft Graph API:", emailContent);

        context.log("Sending email via Microsoft Graph API...");
        const emailResponse = await axios.post(
            `https://graph.microsoft.com/v1.0/users/automations@helix-law.com/sendMail`,
            emailContent,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );
        context.log(`Email API response status: ${emailResponse.status} ${emailResponse.statusText}`);

        if (emailResponse.status === 202) {
            context.log("Email sent successfully.");
            return { success: true, message: "Email sent successfully." };
        } else {
            context.warn(`Unexpected response status from email API: ${emailResponse.status}`);
            return { success: false, error: `Unexpected response status: ${emailResponse.status}` };
        }
    } catch (error) {
        context.error("Error in sendEmailWithGraph function:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    } finally {
        context.log("--- Function sendEmailWithGraph Completed ---");
    }
}

export async function sendEmailHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log("Invocation started for sendEmail Azure Function.");

    let body: RequestBody;

    try {
        context.log("Parsing JSON body from request...");
        body = await req.json() as RequestBody;
        const { email_contents, user_email } = body;

        if (!email_contents || !user_email) {
            context.warn("Request missing 'email_contents' or 'user_email'.");
            return {
                status: 400,
                body: "Request must include 'email_contents' and 'user_email'."
            };
        }
        context.log("Request body parsed successfully.");
        context.log(`Processing email for user_email: ${user_email}`);
        context.log(`email_contents length: ${email_contents.length}`);

        context.log("Initiating sendEmailWithGraph function...");
        const response = await sendEmailWithGraph(email_contents, user_email, context);
        if (response.success) {
            context.log("Email sent successfully. Preparing response...");
            return { status: 200, body: response.message };
        } else {
            context.error("Failed to send email:", response.error);
            return { status: 500, body: response.error };
        }
    } catch (err) {
        context.error("Error processing request:", err);
        return { status: 400, body: "Invalid JSON in request." };
    } finally {
        context.log("Invocation completed for sendEmail Azure Function.");
    }
}

app.http("sendEmail", {
    methods: ["POST"],
    authLevel: "function",
    handler: sendEmailHandler,
});

export default app;
