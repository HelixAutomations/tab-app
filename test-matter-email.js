/**
 * Test script to send the new matter opening email template
 * Run: node test-matter-email.js
 */

const baseUrl = 'https://helix-hub.azurewebsites.net';

async function sendTestEmail() {
    // Mock data simulating a real matter opening
    const matter = {
        id: 13526344,
        display_number: 'WEST 10946-00001'
    };
    
    const formData = {
        matter_details: {
            instruction_ref: 'HLX-28851-39959',
            practice_area: 'Miscellaneous',
            description: 'Advice on company property matter',
            client_type: 'Company'
        },
        team_assignments: {
            fee_earner: 'CS',
            supervising_partner: 'Alex'
        },
        client_information: [{
            company_details: {
                name: 'WEST 10 (ASSET MANAGEMENT) LTD'
            },
            email: 'test@example.com'
        }]
    };

    const mdSafe = formData.matter_details;
    const teamSafe = formData.team_assignments;
    const client = formData.client_information[0];
    const instructionRef = mdSafe.instruction_ref;
    const pa = mdSafe.practice_area;
    const desc = mdSafe.description;
    const clientTypeLabel = mdSafe.client_type;
    const feeEarner = teamSafe.fee_earner;
    const supervisingPartner = teamSafe.supervising_partner;
    
    // Build client name based on type
    let clientName;
    if (clientTypeLabel === 'Company') {
        clientName = client.company_details?.name || client.email || 'Company';
    } else {
        clientName = [client.first_name || client.first, client.last_name || client.last]
            .filter(Boolean)
            .join(' ') || client.email || 'Client';
    }

    const displayNumber = matter.display_number;
    const clioLink = `https://eu.app.clio.com/nc/#/matters/${matter.id}`;

    const subject = `[TEST] New Matter Opened: ${displayNumber}`;
    const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="580" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 600; letter-spacing: -0.025em;">Matter Opened</h1>
                                        <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 13px;">${new Date().toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                    </td>
                                    <td align="right" style="vertical-align: middle;">
                                        <a href="${clioLink}" style="display: inline-block; background: #3b82f6; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; font-weight: 600;">Open in Clio</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Matter Number Hero -->
                    <tr>
                        <td style="padding: 28px 32px 20px 32px; border-bottom: 1px solid #e2e8f0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td>
                                        <p style="margin: 0 0 4px 0; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Matter Number</p>
                                        <p style="margin: 0; color: #0f172a; font-size: 26px; font-weight: 700; letter-spacing: -0.025em;">${displayNumber}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Details Grid -->
                    <tr>
                        <td style="padding: 24px 32px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <!-- Client Row -->
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="140" style="color: #64748b; font-size: 13px; font-weight: 500;">Client</td>
                                                <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${clientName}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Client Type Row -->
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="140" style="color: #64748b; font-size: 13px; font-weight: 500;">Client Type</td>
                                                <td style="color: #0f172a; font-size: 14px;">${clientTypeLabel}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Practice Area Row -->
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="140" style="color: #64748b; font-size: 13px; font-weight: 500;">Practice Area</td>
                                                <td style="color: #0f172a; font-size: 14px;">${pa || '-'}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Description Row -->
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="140" style="color: #64748b; font-size: 13px; font-weight: 500; vertical-align: top;">Description</td>
                                                <td style="color: #0f172a; font-size: 14px;">${desc || '-'}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Fee Earner Row -->
                                <tr>
                                    <td style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="140" style="color: #64748b; font-size: 13px; font-weight: 500;">Fee Earner</td>
                                                <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${feeEarner}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <!-- Supervising Partner Row -->
                                <tr>
                                    <td style="padding: 12px 0;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="140" style="color: #64748b; font-size: 13px; font-weight: 500;">Supervising Partner</td>
                                                <td style="color: #0f172a; font-size: 14px;">${supervisingPartner || '-'}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Instruction Reference Footer -->
                    <tr>
                        <td style="padding: 16px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td style="color: #64748b; font-size: 12px;">
                                        Instruction Reference: <span style="color: #475569; font-weight: 500;">${instructionRef || '-'}</span>
                                    </td>
                                    <td align="right" style="color: #94a3b8; font-size: 11px;">
                                        Clio ID: ${matter.id}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                
                <!-- Footer -->
                <table role="presentation" width="580" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
                    <tr>
                        <td align="center" style="color: #94a3b8; font-size: 11px;">
                            This is an automated notification from Helix Hub.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const emailPayload = {
        user_email: 'lz@helix-law.com',
        subject,
        email_contents: bodyHtml,
        from_email: 'automations@helix-law.com',
        bcc_emails: ''
    };

    console.log('Sending test email to lz@helix-law.com...');
    console.log('Subject:', subject);

    try {
        const response = await fetch(`${baseUrl}/api/sendEmail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailPayload)
        });

        if (response.ok) {
            console.log('✅ Email sent successfully!');
            console.log('Check your inbox for the test email.');
        } else {
            const errorText = await response.text();
            console.error('❌ Failed to send email:', response.status, errorText);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

sendTestEmail();
