// src/tabs/enquiries/EmailSignature.tsx

import React from 'react';

interface EmailSignatureProps {
  bodyHtml: string;
  userData: any;
}

const EmailSignature: React.FC<EmailSignatureProps> = ({ bodyHtml, userData }) => {
  // Extract user info
  const userFullName = userData?.[0]?.['Full Name'] || '';
  const userInitials = userFullName
    ? userFullName
        .split(' ')
        .map((name: string) => name[0].toLowerCase())
        .join('')
    : 'fe'; // fallback
  const userEmail = `${userInitials}@helix-law.com`;

  // "Bulletproof" signature using tables + inline styles
  // The disclaimers are fully spelled out, inlined at 6pt or 7pt, etc.
  // This version aims to mirror the structure from your forwarded code.

  const signatureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Helix Email</title>
</head>
<body style="margin:0; padding:0; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4;">
  <!-- The main email content from PitchBuilder -->
  <div style="margin-bottom:16px;">
    ${bodyHtml}
  </div>

  <!-- Signature Table -->
  <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:0; padding:0; width:auto;">
    <!-- Spacing -->
    <tr style="height:10px;"><td></td></tr>

    <!-- Logo Row -->
    <tr>
      <td>
        <img
          src="https://helix-law.co.uk/wp-content/uploads/2025/01/Asset-2@72x.png"
          alt="Helix Law Logo"
          style="height:50px; display:block; margin:15px 0;"
        />
      </td>
    </tr>

    <!-- Spacing -->
    <tr style="height:10px;"><td></td></tr>

    <!-- Contact Row -->
    <tr>
      <td>
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <!-- Email Icon -->
            <td style="padding-right:4px; vertical-align:middle;">
              <img
                src="https://helix-law.co.uk/wp-content/uploads/2024/10/Asset-4.png"
                alt="Email Icon"
                style="height:12px; vertical-align:middle;"
              />
            </td>
            <td style="padding-right:15px; vertical-align:middle;">
              <a
                href="mailto:${userEmail}"
                style="color:#3690CE; text-decoration:none;"
              >
                ${userEmail}
              </a>
            </td>

            <!-- Phone Icon -->
            <td style="padding-right:4px; vertical-align:middle;">
              <img
                src="https://helix-law.co.uk/wp-content/uploads/2024/10/Asset-3.png"
                alt="Phone Icon"
                style="height:12px; vertical-align:middle;"
              />
            </td>
            <td style="padding-right:15px; vertical-align:middle;">
              <a
                href="tel:+443453142044"
                style="color:#0D2F60; text-decoration:none;"
              >
                0345 314 2044
              </a>
            </td>

            <!-- Website Icon -->
            <td style="padding-right:4px; vertical-align:middle;">
              <img
                src="https://helix-law.co.uk/wp-content/uploads/2024/10/Asset-1.png"
                alt="Website Icon"
                style="height:12px; vertical-align:middle;"
              />
            </td>
            <td style="padding-right:0; vertical-align:middle;">
              <a
                href="https://www.helix-law.com/"
                style="color:#3690CE; text-decoration:none;"
              >
                www.helix-law.com
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Address Row -->
    <tr>
      <td style="padding-top:5px;">
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <!-- Location Icon -->
            <td style="padding-right:4px; vertical-align:middle;">
              <img
                src="https://helix-law.co.uk/wp-content/uploads/2024/10/Asset-2.png"
                alt="Location Icon"
                style="height:12px; vertical-align:middle;"
              />
            </td>
            <td style="vertical-align:middle; color:#0D2F60;">
              Helix Law Ltd, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Spacing -->
    <tr style="height:10px;"><td></td></tr>

    <!-- Disclaimer Row -->
    <tr>
      <td style="color:#D65541; font-size:7pt; line-height:1.5;">
        DISCLAIMER: Please be aware of cyber-crime. Our bank account details will NOT change during the course of a transaction.
        Helix Law Limited will not be liable if you transfer money to an incorrect account.
        We accept no responsibility or liability for malicious or fraudulent emails purportedly coming from our firm,
        and it is your responsibility to ensure that any emails coming from us are genuine before relying on anything contained within them.
      </td>
    </tr>

    <!-- Spacing -->
    <tr style="height:10px;"><td></td></tr>

    <!-- Additional Disclaimer Text Row -->
    <tr>
      <td style="font-style:italic; font-size:7pt; line-height:1.5; color:#444;">
        Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461.
        A list of Directors is available for inspection at the Registered Office: Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE.
        Authorised and regulated by the Solicitors Regulation Authority. The term partner is a reference to a Director or senior solicitor of Helix Law Limited.
        Helix Law Limited do not accept service by email. This email is sent by and on behalf of Helix Law Limited. It may be confidential and may also be legally privileged.
        It is intended only for the stated addressee(s) and access to it by any other person is unauthorised. If you are not an addressee, you must not disclose, copy, circulate
        or in any other way use or rely on the information contained in this email. If you have received it in error, please inform us immediately and delete all copies.
        All copyright is reserved entirely on behalf of Helix Law Limited. Helix Law and applicable logo are exclusively owned trademarks of Helix Law Limited, registered
        with the Intellectual Property Office under numbers UK00003984532 and UK00003984535. The trademarks should not be used, copied or replicated without consent first obtained in writing.
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />;
};

export default EmailSignature;
