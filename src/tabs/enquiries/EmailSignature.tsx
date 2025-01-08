// src/tabs/enquiries/EmailSignature.tsx

import React from 'react';

interface EmailSignatureProps {
  bodyHtml: string;
  userData: any;
}

const EmailSignature: React.FC<EmailSignatureProps> = ({ bodyHtml, userData }) => {
  // Extract user full name from userData
  const userFullName = userData?.[0]?.['Full Name'] || '';
  
  // Compute user initials (e.g., "Lukasz Zemanek" -> "lz")
  const userInitials = userFullName
    ? userFullName
        .split(' ')
        .map((name: string) => name[0].toLowerCase())
        .join('')
    : 'fe'; // Default to 'fe' if no name is available

  // Construct the dynamic email address
  const userEmail = `${userInitials}@helix-law.com`;

  return (
    <>
      <div
        dangerouslySetInnerHTML={{
          __html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Signature</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;700&display=swap');
        html, body {
            margin: 0;
            padding: 0;
        }
        body {
            font-family: 'Raleway', sans-serif;
            font-size: 10pt;
        }
        .signature {
            line-height: 1.4;
            margin: 0;
            padding: 0;
            border-collapse: collapse;
        }
        .signature td {
            vertical-align: top;
            margin: 0;
            padding: 0;
        }
        .signature img.icon {
            height: 12px;
            vertical-align: middle;
        }
        .signature img.logo {
            height: 50px;
            display: block;
            margin: 15px 0;
        }
        .contact-details {
            margin-top: 5px;
        }
        .contact-details td {
            padding-right: 8px;
        }
        .contact-details a {
            color: #3690CE;
            text-decoration: none;
        }
        .small-print {
            font-size: 6pt;
            line-height: 1.5;
        }
        .italic-text {
            font-style: italic;
        }
        .disclaimer {
            color: #D65541;
            margin-bottom: 5px;
        }
        .spacer {
            height: 10px;
        }
        .line-break {
            height: 10px;
        }
        .icon-cell {
            display: inline-block;
            padding-right: 4px;
        }
        .address {
            color: #0D2F60;
        }
    </style>
</head>
<body>
${bodyHtml}
<table class="signature" style="border-collapse: collapse; margin: 0; padding: 0;">
    <!-- Removed Sign-Off Section -->
    
    <!-- Logo Section -->
    <tr class="spacer"></tr>
    <tr>
        <td>
            <img src="https://helix-law.co.uk/wp-content/uploads/2024/03/HLRblue72.png" alt="Helix Law Logo" class="logo">
        </td>
    </tr>
    <tr class="spacer"></tr>
    
    <!-- Contact Details Section -->
    <tr>
        <td class="contact-details">
            <table style="border-collapse: collapse; margin: 0; padding: 0;">
                <tr>
                    <td class="icon-cell">
                        <img src="https://helix-law.co.uk/wp-content/uploads/2024/08/email.png" alt="Email Icon" class="icon">
                    </td>
                    <td style="text-align: left;">
                        <a href="mailto:${userEmail}">${userEmail}</a>
                    </td>
                    <td class="icon-cell">
                        <img src="https://helix-law.co.uk/wp-content/uploads/2024/08/phone.png" alt="Phone Icon" class="icon">
                    </td>
                    <td style="text-align: left;">
                        <a href="tel:+443453142044" style="color: #0D2F60;">0345 314 2044</a>
                    </td>
                    <td class="icon-cell">
                        <img src="https://helix-law.co.uk/wp-content/uploads/2024/08/www.png" alt="Website Icon" class="icon">
                    </td>
                    <td style="text-align: left;">
                        <a href="https://www.helix-law.com/">www.helix-law.com</a>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    
    <!-- Address Section -->
    <tr>
        <td class="contact-details">
            <table style="border-collapse: collapse; margin: 0; padding: 0;">
                <tr>
                    <td class="icon-cell">
                        <img src="https://helix-law.co.uk/wp-content/uploads/2024/08/pin.png" alt="Location Icon" class="icon">
                    </td>
                    <td style="text-align: left;" class="address">
                        Helix Law Ltd, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
                    </td>
                </tr>
            </table>
        </td>
    </tr>
    
    <!-- Disclaimer Section -->
    <tr class="line-break"><td></td></tr>
    <tr>
        <td>
            <p class="small-print disclaimer">
                DISCLAIMER: Please be aware of cyber-crime. Our bank account details will NOT change during the course of a transaction. Helix Law Limited will not be liable if you transfer money to an incorrect account. We accept no responsibility or liability for malicious or fraudulent emails purportedly coming from our firm, and it is your responsibility to ensure that any emails coming from us are genuine before relying on anything contained within them.
            </p>
        </td>
    </tr>
    
    <!-- Additional Disclaimer Text -->
    <tr class="line-break"><td></td></tr>
    <tr>
        <td>
            <p class="small-print italic-text">
                Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461.<br>
                A list of Directors is available for inspection at the Registered Office: Second Floor, Britannia House, 21 Station Street, Brighton BN1 4DE. Authorised and regulated by the Solicitors Regulation Authority. The term partner is a reference to a Director or senior solicitor of Helix Law Limited. Helix Law Limited do not accept service by email. This email is sent by and on behalf of Helix Law Limited. It may be confidential and may also be legally privileged. It is intended only for the stated addressee(s) and access to it by any other person is unauthorised. If you are not an addressee, you must not disclose, copy, circulate or in any other way use or rely on the information contained in this email. If you have received it in error, please inform us immediately and delete all copies. All copyright is reserved entirely on behalf of Helix Law Limited. Helix Law and applicable logo are exclusively owned trademarks of Helix Law Limited, registered with the Intellectual Property Office under numbers UK00003984532 and UK00003984535. The trademarks should not be used, copied or replicated without consent first obtained in writing.
            </p>
        </td>
    </tr>
</table>
</body>
</html>`
        }}
      />
    </>
  );
};

export default EmailSignature;
