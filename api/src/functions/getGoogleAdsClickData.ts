// src/functions/getGoogleAdsClickData.ts
// Azure Function to look up GCLID details from Google Ads API

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { google } from "googleapis";

interface RequestBody {
    gclid?: string;
    gclids?: string[];
    customerId: string; // Google Ads customer ID (without dashes)
}

interface ClickViewResult {
    gclid: string;
    clickDate?: string;
    campaignId?: string;
    campaignName?: string;
    adGroupId?: string;
    adGroupName?: string;
    keyword?: string;
    keywordMatchType?: string;
    device?: string;
    locationCity?: string;
    locationCountry?: string;
    adNetworkType?: string;
    clickType?: string;
    pageNumber?: number;
    slot?: string;
    error?: string;
}

interface GoogleAdsCredentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    developerToken: string;
}

// Simple in-memory cache with TTL
const clickCache = new Map<string, { data: ClickViewResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - click data doesn't change

async function getGoogleAdsCredentials(context: InvocationContext): Promise<GoogleAdsCredentials> {
    const keyVaultUri = process.env.KEY_VAULT_URI;
    if (!keyVaultUri) {
        throw new Error("KEY_VAULT_URI environment variable not set");
    }

    const credential = new DefaultAzureCredential();
    const secretClient = new SecretClient(keyVaultUri, credential);

    const [clientIdSecret, clientSecretSecret, refreshTokenSecret, developerTokenSecret] = await Promise.all([
        secretClient.getSecret("google-ads-client-id"),
        secretClient.getSecret("google-ads-client-secret"),
        secretClient.getSecret("google-ads-refresh-token"),
        secretClient.getSecret("google-ads-developer-token"),
    ]);

    return {
        clientId: clientIdSecret.value || "",
        clientSecret: clientSecretSecret.value || "",
        refreshToken: refreshTokenSecret.value || "",
        developerToken: developerTokenSecret.value || "",
    };
}

async function queryGoogleAdsClickView(
    gclid: string,
    customerId: string,
    credentials: GoogleAdsCredentials,
    context: InvocationContext
): Promise<ClickViewResult> {
    // Check cache first
    const cached = clickCache.get(gclid);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        context.log(`Cache hit for GCLID: ${gclid}`);
        return cached.data;
    }

    try {
        // Set up OAuth2 client
        const oauth2Client = new google.auth.OAuth2(
            credentials.clientId,
            credentials.clientSecret
        );
        oauth2Client.setCredentials({
            refresh_token: credentials.refreshToken,
        });

        // Google Ads API query using the click_view resource
        // Note: This requires the Google Ads API v17+ and appropriate permissions
        const query = `
            SELECT
                click_view.gclid,
                click_view.ad_group_ad,
                click_view.campaign_location_target,
                click_view.user_list,
                click_view.keyword,
                click_view.keyword_info.text,
                click_view.keyword_info.match_type,
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                segments.click_type,
                segments.device,
                segments.ad_network_type,
                segments.slot,
                segments.date
            FROM click_view
            WHERE click_view.gclid = '${gclid}'
        `;

        // Make the API request using googleads REST endpoint
        // Note: googleapis package uses REST API under the hood
        const accessToken = await oauth2Client.getAccessToken();
        
        const response = await fetch(
            `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken.token}`,
                    "developer-token": credentials.developerToken,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            context.error(`Google Ads API error for GCLID ${gclid}:`, errorText);
            
            // Handle common errors
            if (response.status === 403) {
                return { gclid, error: "Access denied - check API permissions and developer token" };
            }
            if (response.status === 400) {
                // GCLID might be too old (>90 days) or invalid
                return { gclid, error: "GCLID not found - may be expired (>90 days) or invalid" };
            }
            return { gclid, error: `API error: ${response.status}` };
        }

        const data = await response.json();
        
        // Parse the response - Google Ads returns an array of result batches
        const results = data.flatMap((batch: any) => batch.results || []);
        
        if (results.length === 0) {
            const result: ClickViewResult = { gclid, error: "No data found for this GCLID" };
            clickCache.set(gclid, { data: result, timestamp: Date.now() });
            return result;
        }

        const row = results[0];
        const clickResult: ClickViewResult = {
            gclid,
            clickDate: row.segments?.date,
            campaignId: row.campaign?.id,
            campaignName: row.campaign?.name,
            adGroupId: row.adGroup?.id,
            adGroupName: row.adGroup?.name,
            keyword: row.clickView?.keywordInfo?.text,
            keywordMatchType: row.clickView?.keywordInfo?.matchType,
            device: row.segments?.device,
            adNetworkType: row.segments?.adNetworkType,
            clickType: row.segments?.clickType,
            slot: row.segments?.slot,
        };

        // Cache the result
        clickCache.set(gclid, { data: clickResult, timestamp: Date.now() });
        context.log(`Successfully retrieved data for GCLID: ${gclid}`);

        return clickResult;
    } catch (error) {
        context.error(`Error querying Google Ads for GCLID ${gclid}:`, error);
        return { gclid, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

export async function getGoogleAdsClickDataHandler(
    req: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("Invocation started for getGoogleAdsClickData Azure Function.");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return {
            status: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
            body: "",
        };
    }

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch (error) {
        return {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Invalid JSON format in request body" }),
        };
    }

    const { gclid, gclids, customerId } = body;

    if (!customerId) {
        return {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Missing 'customerId' (Google Ads customer ID without dashes)" }),
        };
    }

    if (!gclid && (!gclids || gclids.length === 0)) {
        return {
            status: 400,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Missing 'gclid' or 'gclids' array" }),
        };
    }

    try {
        // Get credentials from Key Vault
        const credentials = await getGoogleAdsCredentials(context);

        // Process single or multiple GCLIDs
        const gclidList = gclids || (gclid ? [gclid] : []);
        
        // Limit batch size to prevent timeouts
        const MAX_BATCH_SIZE = 50;
        if (gclidList.length > MAX_BATCH_SIZE) {
            return {
                status: 400,
                headers: { "Access-Control-Allow-Origin": "*" },
                body: JSON.stringify({ error: `Maximum ${MAX_BATCH_SIZE} GCLIDs per request` }),
            };
        }

        // Query each GCLID (in parallel with rate limiting)
        const results: ClickViewResult[] = [];
        const batchSize = 5; // Process 5 at a time to avoid rate limits
        
        for (let i = 0; i < gclidList.length; i += batchSize) {
            const batch = gclidList.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map((g) => queryGoogleAdsClickView(g, customerId, credentials, context))
            );
            results.push(...batchResults);
            
            // Small delay between batches to respect rate limits
            if (i + batchSize < gclidList.length) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
        }

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            body: JSON.stringify({
                success: true,
                count: results.length,
                results: gclid ? results[0] : results,
            }),
        };
    } catch (error) {
        context.error("Error in getGoogleAdsClickData:", error);
        return {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                error: error instanceof Error ? error.message : "Internal server error",
            }),
        };
    }
}

// Register the function
app.http("getGoogleAdsClickData", {
    methods: ["GET", "POST", "OPTIONS"],
    authLevel: "anonymous",
    handler: getGoogleAdsClickDataHandler,
});
