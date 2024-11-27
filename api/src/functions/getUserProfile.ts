/* This code sample provides a starter kit to implement server side logic for your Teams App in TypeScript,
 * refer to https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference for complete Azure Functions
 * developer guide.
 */

// Import polyfills for fetch required by msgraph-sdk-javascript.
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  OnBehalfOfCredentialAuthConfig,
  OnBehalfOfUserCredential,
  UserInfo,
} from "@microsoft/teamsfx";
import config from "../config";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Register the HTTP trigger **synchronously** before defining the handler function.
 * This ensures that the function is registered during app startup without delays.
 */
app.http("getUserProfile", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: getUserProfile,
});

/**
 * This function handles requests from the Teams app client.
 * The HTTP request should contain an SSO token queried from Teams in the header.
 *
 * The response contains multiple message blocks constructed into a JSON object, including:
 * - An echo of the request body.
 * - The display name encoded in the SSO token.
 * - Current user's Microsoft 365 profile if the user has consented.
 *
 * @param {HttpRequest} req - The HTTP request.
 * @param {InvocationContext} context - The Azure Functions context object.
 * @returns {Promise<HttpResponseInit>} - The HTTP response.
 */
export async function getUserProfile(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("HTTP trigger function processed a request.");

  // Initialize response.
  const res: HttpResponseInit = {
    status: 200,
  };
  const body: Record<string, any> = {};

  // Put an echo into response body.
  try {
    body.receivedHTTPRequestBody = (await req.text()) || "";
  } catch (error) {
    context.error("Failed to read request body:", error);
    return {
      status: 400,
      body: JSON.stringify({
        error: "Invalid request body.",
      }),
    };
  }

  // Prepare access token.
  const authorizationHeader = req.headers.get("Authorization");
  const accessToken: string | null = authorizationHeader
    ? authorizationHeader.replace("Bearer ", "").trim()
    : null;

  if (!accessToken) {
    return {
      status: 400,
      body: JSON.stringify({
        error: "No access token was found in request header.",
      }),
    };
  }

  // Ensure all required configuration values are defined.
  if (
    !config.authorityHost ||
    !config.clientId ||
    !config.tenantId ||
    !config.clientSecret
  ) {
    context.error("Missing required configuration values.");
    return {
      status: 500,
      body: JSON.stringify({
        error: "Server configuration is incomplete. Please contact the administrator.",
      }),
    };
  }

  const oboAuthConfig: OnBehalfOfCredentialAuthConfig = {
    authorityHost: config.authorityHost,
    clientId: config.clientId,
    tenantId: config.tenantId,
    clientSecret: config.clientSecret,
  };

  let oboCredential: OnBehalfOfUserCredential;
  try {
    oboCredential = new OnBehalfOfUserCredential(accessToken, oboAuthConfig);
  } catch (e) {
    context.error("Error constructing OnBehalfOfUserCredential:", e);
    return {
      status: 500,
      body: JSON.stringify({
        error:
          "Failed to construct OnBehalfOfUserCredential using your accessToken. " +
          "Ensure your function app is configured with the right Microsoft Entra App registration.",
      }),
    };
  }

  // Query user's information from the access token.
  try {
    const currentUser: UserInfo = await oboCredential.getUserInfo();
    if (currentUser && currentUser.displayName) {
      body.userInfoMessage = `User display name is ${currentUser.displayName}.`;
    } else {
      body.userInfoMessage = "No user information was found in access token.";
    }
  } catch (e) {
    context.error("Error retrieving user info:", e);
    return {
      status: 400,
      body: JSON.stringify({
        error: "Access token is invalid.",
      }),
    };
  }

  // Create a graph client with default scope to access user's Microsoft 365 data after user has consented.
  try {
    // Create an instance of the TokenCredentialAuthenticationProvider by passing the tokenCredential instance and options to the constructor
    const authProvider = new TokenCredentialAuthenticationProvider(oboCredential, {
      scopes: ["https://graph.microsoft.com/.default"],
    });

    // Initialize Graph client instance with authProvider
    const graphClient = Client.initWithMiddleware({
      authProvider: authProvider,
    });

    // Retrieve the user's profile from Microsoft Graph
    const graphResponse = await graphClient.api("/me").get();
    body.graphClientMessage = graphResponse;
  } catch (e) {
    context.error("Error retrieving Microsoft Graph data:", e);
    return {
      status: 500,
      body: JSON.stringify({
        error:
          "Failed to retrieve user profile from Microsoft Graph. The application may not be authorized.",
      }),
    };
  }

  // Set the response body
  res.body = JSON.stringify(body);

  return res;
}

/**
 * If you prefer to define the handler function separately, ensure that the registration with `app.http` happens before any asynchronous operations.
 * Below is an alternative approach where the handler is defined as a separate function.
 */
/*
app.http("getUserProfile", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: getUserProfile,
});

export async function getUserProfile(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  // Function implementation remains the same as above.
}
*/
