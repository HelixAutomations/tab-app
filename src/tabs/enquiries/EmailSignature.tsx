import React from 'react';

interface EmailSignatureProps {
  bodyHtml: string;
  userData: any;
  experimentalLayout?: boolean; // Deprecated: kept for compatibility but ignored (always uses clean layout)
  isDarkMode?: boolean; // For preview modal styling
}

const EmailSignature: React.FC<EmailSignatureProps> = ({ bodyHtml, userData, isDarkMode = false }) => {
  const userFullName = userData?.[0]?.FullName || userData?.[0]?.['Full Name'] || '';
  const userFirstName = userData?.[0]?.['First'] || '';
  const userRole = userData?.[0]?.['Role'] || '';
  const userInitials = userFullName
    ? userFullName
        .split(' ')
        .map((name: string) => name[0].toLowerCase())
        .join('')
    : 'fe'; // fallback
  const userEmail = `${userInitials}@helix-law.com`;

  // Color scheme based on dark mode (for preview modal)
  const baseTextColor = isDarkMode ? '#E2E8F0' : '#000';
  const disclaimerColor = isDarkMode ? '#FCA5A5' : '#D65541';
  const locationColor = isDarkMode ? '#CBD5E1' : '#0D2F60';
  const regularTextColor = isDarkMode ? '#94A3B8' : '#444';
  const forceTextColor = isDarkMode ? 'color:#E2E8F0 !important;' : '';

  const signatureHtml = `
<div style="margin:0; padding:0; font-family: Raleway, Arial, sans-serif; font-size:10pt; line-height:1.4; color:${baseTextColor};">
  <div style="margin-bottom:4px;">${bodyHtml}</div>
  <p style="margin:16px 0 8px; color:${baseTextColor};">${userFirstName}</p>
  <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:0; padding:0; width:auto; font-size:10pt; ${forceTextColor}">
    <tr>
      <td style="padding-bottom:8px; font-size:10pt; font-family:Raleway, Arial, sans-serif; ${forceTextColor}">
        ${userFullName}<br />${userRole}
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:8px;">
        <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/50px-logo.png" alt="Helix Law Logo" style="height:56px; display:block;" />
      </td>
    </tr>
    <tr>
      <td style="padding-top:8px; padding-bottom:0;">
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:10pt; line-height:1.5;">
          <tr>
            <td style="padding-right:6px; vertical-align:middle;">
              <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/email.png" alt="Email" style="height:14px; vertical-align:middle;" />
            </td>
            <td style="padding-right:14px; vertical-align:middle;">
              <a href="mailto:${userEmail}" style="color:#3690CE; text-decoration:none;">${userEmail}</a>
            </td>
            <td style="padding-right:6px; vertical-align:middle;">
              <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/website.png" alt="Website" style="height:14px; vertical-align:middle;" />
            </td>
            <td style="padding-right:0; vertical-align:middle;">
              <a href="https://www.helix-law.com/" style="color:#3690CE; text-decoration:none;">www.helix-law.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:6px; padding-bottom:8px;">
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:10pt; line-height:1.5;">
          <tr>
            <td style="padding-right:6px; vertical-align:middle;">
              <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/location.png" alt="Address" style="height:14px; vertical-align:middle;" />
            </td>
            <td style="vertical-align:middle; color:${locationColor};">
              Helix Law Ltd, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-top:8px; color:${disclaimerColor}; font-size:7pt; line-height:1.5;">
        DISCLAIMER: Please be aware of cyber-crime. Our bank account details will NOT change during the course of a transaction.
        Helix Law Limited will not be liable if you transfer money to an incorrect account.
        We accept no responsibility or liability for malicious or fraudulent emails purportedly coming from our firm,
        and it is your responsibility to ensure that any emails coming from us are genuine before relying on anything contained within them.
      </td>
    </tr>
    <tr>
      <td style="padding-top:8px; font-style:italic; font-size:7pt; line-height:1.5; color:${regularTextColor};">
        Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461. A list of Directors is available for inspection at the Registered Office: Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE. Authorised and regulated by the Solicitors Regulation Authority. The term partner is a reference to a Director or senior solicitor of Helix Law Limited. Helix Law Limited does not accept service by email. This email is sent by and on behalf of Helix Law Limited. It may be confidential and may also be legally privileged. It is intended only for the stated addressee(s) and access to it by any other person is unauthorised. If you are not an addressee, you must not disclose, copy, circulate or in any other way use or rely on the information contained in this email. If you have received it in error, please inform us immediately and delete all copies. All copyright is reserved entirely on behalf of Helix Law Limited. Helix Law and applicable logo are exclusively owned trademarks of Helix Law Limited, registered with the Intellectual Property Office under numbers UK00003984532 and UK00003984535. The trademarks should not be used, copied or replicated without consent first obtained in writing.
      </td>
    </tr>
  </table>
</div>
`;

  return <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />;
};

export default EmailSignature;