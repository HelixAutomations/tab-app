/**
 * validate(schema) — Express middleware factory for zod request validation.
 *
 * Usage:
 *   const { z } = require('zod');
 *   const { validate } = require('../middleware/validate');
 *
 *   router.post('/foo', validate({ body: z.object({ name: z.string() }) }), handler);
 *   router.get('/bar', validate({ query: z.object({ id: z.string() }) }), handler);
 */
const { trackEvent } = require('../utils/appInsights');

/**
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType }} schemas
 */
function validate(schemas) {
    return (req, res, next) => {
        const errors = [];

        for (const [source, schema] of Object.entries(schemas)) {
            const result = schema.safeParse(req[source]);
            if (!result.success) {
                errors.push(...result.error.issues.map(i => ({
                    source,
                    path: i.path.join('.'),
                    message: i.message,
                })));
            } else {
                // Replace with parsed (coerced/defaulted) values
                req[source] = result.data;
            }
        }

        if (errors.length > 0) {
            trackEvent('Security.Validation.Rejected', {
                path: req.path,
                method: req.method,
                errors: JSON.stringify(errors),
                user: req.user?.initials || 'unknown',
            });

            return res.status(400).json({
                error: 'validation_error',
                message: 'Request validation failed.',
                details: errors,
            });
        }

        next();
    };
}

module.exports = { validate };
