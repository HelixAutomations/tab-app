/**
 * Environment variable validation — runs at boot before any connections.
 * Crashes fast with a clear message if config is wrong.
 */
const { z } = require('zod');
const { trackEvent } = require('./appInsights');

const envSchema = z.object({
    // SQL — must be present (can be <REDACTED> if Key Vault will hydrate)
    SQL_CONNECTION_STRING: z.string().min(1, 'SQL_CONNECTION_STRING missing'),
    INSTRUCTIONS_SQL_CONNECTION_STRING: z.string().min(1, 'INSTRUCTIONS_SQL_CONNECTION_STRING missing'),

    // Redis (optional locally, required in production)
    REDIS_HOST: z.string().optional(),
    REDIS_KEY: z.string().optional(),

    // Clio OAuth
    CLIO_CLIENT_ID: z.string().optional(),
    CLIO_CLIENT_SECRET: z.string().optional(),

    // Azure
    APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
    KEY_VAULT_URL: z.string().optional(),

    // Server
    PORT: z.string().optional().default('8080'),
    NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
    ALLOWED_ORIGINS: z.string().optional(),
});

/**
 * Validates process.env and returns parsed values.
 * In production, missing critical vars throw (crash-fast).
 * In dev, warns but continues if Key Vault can hydrate later.
 */
function validateEnv() {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const issues = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
        const message = `[EnvValidation] Configuration errors:\n${issues}`;

        trackEvent('Server.Boot.EnvValidation.Failed', {
            issues: JSON.stringify(result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }))),
        });

        if (process.env.NODE_ENV === 'production') {
            console.error(message);
            throw new Error('Environment validation failed — refusing to start. Check env vars.');
        } else {
            console.warn(message + '\n  (continuing in dev mode — Key Vault may hydrate missing values)');
        }
    } else {
        trackEvent('Server.Boot.EnvValidation.Passed', {});
    }

    return result.success ? result.data : process.env;
}

module.exports = { validateEnv, envSchema };
