import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

export async function approveVerificationHandler(
    req: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("approveVerificationHandler invoked");

    if (req.method !== "POST") {
        return { status: 405, body: "Method not allowed" };
    }

    try {
        const instructionRef = req.params.instructionRef;
        
        if (!instructionRef) {
            return { 
                status: 400, 
                body: JSON.stringify({ error: 'Instruction reference is required' }),
                headers: { "Content-Type": "application/json" }
            };
        }

        const sql = require('mssql');
        
        // Database connection config
        const config = {
            user: process.env.DB_USER || 'helix-database-server',
            password: process.env.DB_PASSWORD,
            server: 'instructions.database.windows.net',
            database: 'instructions',
            options: { 
                encrypt: true,
                trustServerCertificate: false
            }
        };

        // Get the instruction details first
        const getInstructionQuery = `
            SELECT 
                i.InternalId,
                i.FirstName,
                i.Surname,
                i.Email
            FROM Instructions i
            WHERE i.InstructionRef = @instructionRef
        `;

        const pool = await sql.connect(config);
        let request = pool.request();
        request.input('instructionRef', sql.VarChar(50), instructionRef);
        
        const instructionResult = await request.query(getInstructionQuery);
        
        if (instructionResult.recordset.length === 0) {
            return { 
                status: 404, 
                body: JSON.stringify({ error: 'Instruction not found' }),
                headers: { "Content-Type": "application/json" }
            };
        }

        const instruction = instructionResult.recordset[0];

        // Update the verification status
        const updateQuery = `
            UPDATE IDVerifications 
            SET 
                EIDOverallResult = 'Verified',
                LastUpdated = GETDATE()
            WHERE InstructionInternalId = @internalId
        `;

        request = pool.request();
        request.input('internalId', sql.Int, instruction.InternalId);
        
        await request.query(updateQuery);

        // Also update the Instructions table stage if needed
        const updateInstructionQuery = `
            UPDATE Instructions 
            SET 
                stage = 'proof-of-id-complete',
                EIDOverallResult = 'Verified'
            WHERE InternalId = @internalId
        `;

        request = pool.request();
        request.input('internalId', sql.Int, instruction.InternalId);
        
        await request.query(updateInstructionQuery);

        // Approval is a state change only; we do not send any client emails here.

        return {
            status: 200,
            body: JSON.stringify({
                success: true,
                message: 'Verification approved successfully',
                instructionRef,
                emailSent: false
            }),
            headers: { "Content-Type": "application/json" }
        };

    } catch (error: any) {
        context.error('Error approving verification:', error);
        return { 
            status: 500,
            body: JSON.stringify({ 
                error: 'Internal server error',
                details: error?.message || 'Unknown error'
            }),
            headers: { "Content-Type": "application/json" }
        };
    }
}

app.http("approveVerification", {
    methods: ["POST"],
    authLevel: "function",
    route: "instructions/{instructionRef}/approve-verification",
    handler: approveVerificationHandler,
});
