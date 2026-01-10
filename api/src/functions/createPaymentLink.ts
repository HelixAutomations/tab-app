import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

/**
 * Creates a Stripe Payment Link for ad-hoc payment requests.
 * Used when:
 * - Documents were uploaded via other methods
 * - The instruction link wasn't used or expired
 * - Need to request additional payments
 */
export async function createPaymentLinkHandler(
    req: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("createPaymentLinkHandler invoked");

    // CORS headers
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
        return { status: 204, headers };
    }

    if (req.method !== "POST") {
        return { status: 405, body: JSON.stringify({ error: "Method not allowed" }), headers };
    }

    try {
        const body = await req.json() as {
            instructionRef: string;
            amount: number;
            description?: string;
            clientEmail?: string;
            clientName?: string;
        };

        const { instructionRef, amount, description, clientEmail, clientName } = body;

        if (!instructionRef || !amount) {
            return {
                status: 400,
                body: JSON.stringify({ error: "instructionRef and amount are required" }),
                headers,
            };
        }

        if (amount < 1) {
            return {
                status: 400,
                body: JSON.stringify({ error: "Amount must be at least £1" }),
                headers,
            };
        }

        // Initialize Stripe
        const Stripe = require("stripe");
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY || process.env.INSTRUCTIONS_SANDBOX_SK;
        
        if (!stripeSecretKey) {
            context.log("Stripe secret key not configured");
            return {
                status: 500,
                body: JSON.stringify({ error: "Payment service not configured" }),
                headers,
            };
        }

        const stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2024-12-18.acacia",
        });

        // Create a Price for this one-time payment
        const price = await stripe.prices.create({
            currency: "gbp",
            unit_amount: Math.round(amount * 100), // Convert to pence
            product_data: {
                name: description || `Payment for ${instructionRef}`,
            },
        });

        // Create the Payment Link
        const paymentLink = await stripe.paymentLinks.create({
            line_items: [
                {
                    price: price.id,
                    quantity: 1,
                },
            ],
            metadata: {
                instructionRef,
                source: "helix-hub-payment-request",
                requestedAt: new Date().toISOString(),
            },
            after_completion: {
                type: "redirect",
                redirect: {
                    url: `https://helix-law.com/payment-complete?ref=${instructionRef}`,
                },
            },
        });

        // Store payment request in database
        const sql = require("mssql");
        const paymentId = `plink_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const config = {
            user: process.env.DB_USER || "helix-database-server",
            password: process.env.DB_PASSWORD,
            server: "instructions.database.windows.net",
            database: "instructions",
            options: {
                encrypt: true,
                trustServerCertificate: false,
            },
        };

        const pool = await sql.connect(config);
        
        // Insert payment record
        await pool.request()
            .input("id", sql.NVarChar, paymentId)
            .input("paymentLinkId", sql.NVarChar, paymentLink.id)
            .input("paymentLinkUrl", sql.NVarChar, paymentLink.url)
            .input("amount", sql.Decimal(10, 2), amount)
            .input("amountMinor", sql.Int, Math.round(amount * 100))
            .input("currency", sql.NVarChar, "GBP")
            .input("instructionRef", sql.NVarChar, instructionRef)
            .input("description", sql.NVarChar, description || `Payment request for ${instructionRef}`)
            .input("clientEmail", sql.NVarChar, clientEmail || null)
            .input("clientName", sql.NVarChar, clientName || null)
            .input("metadata", sql.NVarChar, JSON.stringify({
                source: "helix-hub-payment-request",
                requestedAt: new Date().toISOString(),
                clientEmail,
                clientName,
            }))
            .query(`
                INSERT INTO payments (
                    id, payment_intent_id, amount, amount_minor, currency,
                    instruction_ref, payment_status, internal_status,
                    metadata, service_description
                )
                VALUES (
                    @id, @paymentLinkId, @amount, @amountMinor, @currency,
                    @instructionRef, 'pending', 'pending',
                    @metadata, @description
                )
            `);

        await pool.close();

        context.log(`Created payment link ${paymentLink.id} for ${instructionRef}`);

        return {
            status: 200,
            body: JSON.stringify({
                success: true,
                paymentId,
                paymentLinkId: paymentLink.id,
                paymentLinkUrl: paymentLink.url,
                amount,
                currency: "GBP",
                instructionRef,
            }),
            headers,
        };

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        context.log(`Error creating payment link: ${errorMessage}`);
        return {
            status: 500,
            body: JSON.stringify({ error: `Failed to create payment link: ${errorMessage}` }),
            headers,
        };
    }
}

app.http("createPaymentLink", {
    methods: ["POST", "OPTIONS"],
    authLevel: "anonymous",
    route: "payment-link",
    handler: createPaymentLinkHandler,
});
