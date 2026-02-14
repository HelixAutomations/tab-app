/**
 * Azure OpenAI singleton client for server-side AI operations.
 *
 * Uses the same Key Vault pattern as enquiry-processing-v2:
 *   Key Vault → azure-openai-api-key → AzureOpenAI client
 *
 * Environment variables:
 *   AZURE_OPENAI_ENDPOINT    – Azure OpenAI resource endpoint
 *   AZURE_OPENAI_API_KEY     – (optional) direct key; skips Key Vault
 *   AZURE_OPENAI_DEPLOYMENT  – model deployment name (default: gpt-5.1, matching enquiry-processing-v2)
 *   AZURE_OPENAI_KEY_SECRET / AZURE_OPENAI_KEY_SECRET_NAME – Key Vault secret name
 */
const { getSecret } = require('./getSecret');
const { trackEvent, trackException, trackMetric } = require('./appInsights');

let _client = null;
let _initialising = false;
const _waiters = [];

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://autom-midmw1iy-eastus2.cognitiveservices.azure.com/';
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.1';
const KEY_SECRET_NAME = process.env.AZURE_OPENAI_KEY_SECRET || process.env.AZURE_OPENAI_KEY_SECRET_NAME || 'azure-openai-api-key';

/**
 * Get or create the singleton Azure OpenAI client.
 * Thread-safe via simple queue pattern.
 */
async function getAIClient() {
    if (_client) return _client;

    if (_initialising) {
        return new Promise((resolve, reject) => {
            _waiters.push({ resolve, reject });
        });
    }

    _initialising = true;
    try {
        // Try direct env var first, then Key Vault
        let apiKey = process.env.AZURE_OPENAI_API_KEY;
        if (!apiKey) {
            apiKey = await getSecret(KEY_SECRET_NAME);
        }
        if (!apiKey) {
            throw new Error('Azure OpenAI API key not found in env or Key Vault');
        }

        // Use the OpenAI SDK with Azure config (works with openai npm package)
        const { AzureOpenAI } = require('openai');
        _client = new AzureOpenAI({
            endpoint: ENDPOINT,
            apiKey,
            apiVersion: '2024-10-21',
            deployment: DEPLOYMENT,
        });

        console.log(`[AI] Azure OpenAI client initialised (deployment: ${DEPLOYMENT})`);
        trackEvent('AI.Client.Initialised', { deployment: DEPLOYMENT, endpoint: ENDPOINT });

        // Resolve any queued waiters
        _waiters.forEach(w => w.resolve(_client));
        _waiters.length = 0;

        return _client;
    } catch (err) {
        console.error('[AI] Failed to initialise Azure OpenAI client:', err.message);
        trackException(err, { operation: 'AI.Client.Init', deployment: DEPLOYMENT });

        // Reject any queued waiters
        _waiters.forEach(w => w.reject(err));
        _waiters.length = 0;

        throw err;
    } finally {
        _initialising = false;
    }
}

/**
 * Make a chat completion call with structured JSON output.
 *
 * @param {string} systemPrompt - System instructions
 * @param {string} userPrompt - User content to process
 * @param {object} [options] - Override temperature, max_tokens, deployment
 * @returns {object} Parsed JSON response
 */
async function chatCompletion(systemPrompt, userPrompt, options = {}) {
    const client = await getAIClient();
    const deployment = options.deployment || DEPLOYMENT;
    const trackingId = Math.random().toString(36).slice(2, 10);
    const startMs = Date.now();

    trackEvent('AI.ChatCompletion.Started', {
        trackingId,
        deployment,
        systemPromptLength: String(systemPrompt.length),
        userPromptLength: String(userPrompt.length),
    });

    try {
        // Aligned with enquiry-processing-v2: do NOT send max_tokens or
        // max_completion_tokens — the model uses its own default and this
        // avoids 400 "unsupported parameter" errors across GPT-4/5 variants.
        const requestBody = {
            model: deployment,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: options.temperature ?? 0.2,
            response_format: { type: 'json_object' },
        };

        // Only include max tokens if explicitly requested via options
        if (options.max_tokens) {
            // Try max_completion_tokens first (GPT-5+), fall back to max_tokens
            const deploymentText = String(deployment || '');
            if (/^gpt-5(\.|-|$)/i.test(deploymentText)) {
                requestBody.max_completion_tokens = options.max_tokens;
            } else {
                requestBody.max_tokens = options.max_tokens;
            }
        }

        const response = await client.chat.completions.create(requestBody);

        const durationMs = Date.now() - startMs;
        const content = response.choices?.[0]?.message?.content || '{}';
        const usage = response.usage || {};

        trackEvent('AI.ChatCompletion.Completed', {
            trackingId,
            deployment,
            maxTokensSent: String(!!options.max_tokens),
            durationMs: String(durationMs),
            promptTokens: String(usage.prompt_tokens || 0),
            completionTokens: String(usage.completion_tokens || 0),
            totalTokens: String(usage.total_tokens || 0),
        });
        trackMetric('AI.ChatCompletion.Duration', durationMs, { deployment });
        trackMetric('AI.ChatCompletion.Tokens', usage.total_tokens || 0, { deployment });

        try {
            return JSON.parse(content);
        } catch (parseErr) {
            console.warn(`[AI] JSON parse failed (trackingId: ${trackingId}), returning raw`);
            trackException(parseErr, { operation: 'AI.ChatCompletion.Parse', trackingId });
            return { _raw: content, _parseError: true };
        }
    } catch (err) {
        const durationMs = Date.now() - startMs;
        console.error(`[AI] Chat completion failed (trackingId: ${trackingId}):`, err.message);
        trackException(err, { operation: 'AI.ChatCompletion', trackingId, deployment, durationMs: String(durationMs) });
        throw err;
    }
}

module.exports = { getAIClient, chatCompletion, DEPLOYMENT, ENDPOINT };
