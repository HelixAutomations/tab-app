import React from 'react';

interface EmailSignatureProps {
  bodyHtml: string;
  userData: any;
  experimentalLayout?: boolean; // V2-only: render like a normal email (no outer padding/boxing)
  isDarkMode?: boolean; // For preview modal styling
}

const EmailSignature: React.FC<EmailSignatureProps> = ({ bodyHtml, userData, experimentalLayout = false, isDarkMode = false }) => {
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

  // Styles that vary by layout mode
  const outerTdPadding = experimentalLayout ? '0' : '10px';
  const baseTextColor = experimentalLayout ? (isDarkMode ? '#E2E8F0' : '') : (isDarkMode ? '#E2E8F0' : '#000');
  const baseParagraphColorStyle = experimentalLayout ? (isDarkMode ? 'color:#E2E8F0 !important;' : '') : (isDarkMode ? 'color:#E2E8F0 !important;' : 'color:#000;');
  const disclaimerColor = isDarkMode ? '#FCA5A5' : '#D65541'; // Light red in dark mode
  const locationColor = isDarkMode ? '#CBD5E1' : '#0D2F60';
  const regularTextColor = isDarkMode ? '#94A3B8' : '#444';
  const forceTextColor = isDarkMode ? 'color:#E2E8F0 !important;' : '';
  
  // Debug: Force dark mode styling if we detect we're in a dark container
  const effectiveIsDarkMode = isDarkMode || experimentalLayout; // experimental layout is used in preview modal
  const finalRegularTextColor = effectiveIsDarkMode ? '#94A3B8' : '#444';
  const finalLocationColor = effectiveIsDarkMode ? '#CBD5E1' : '#0D2F60';

  const signatureHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Helix Email</title>
</head>
<body style="margin:0; padding:0; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${baseTextColor ? `color:${baseTextColor};` : ''}">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td style="padding:${outerTdPadding}; font-family:Raleway, sans-serif; font-size:10pt; ${baseTextColor ? `color:${baseTextColor};` : ''}">
        ${bodyHtml}
        <p style="font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${baseParagraphColorStyle} margin:16px 0 8px;">${userFirstName}</p>
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin:0; padding:0; width:auto; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
          <tr>
            <td style="padding-bottom: 8px; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
              ${userFullName}<br />${userRole}
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 8px; font-family: Raleway, sans-serif; ${forceTextColor}">
              <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/50px-logo.png" alt="Helix Law Logo" style="height:50px; display:block; margin:15px 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding-top: 8px; padding-bottom: 8px; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
              <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size:10pt; line-height:1.4;">
                <tr>
                  <td style="padding-right:4px; vertical-align:middle;">
                    <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/email.png" alt="Email Icon" style="height:12px; vertical-align:middle;" />
                  </td>
                  <td style="padding-right:15px; vertical-align:middle; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
                    <a href="mailto:${userEmail}" style="color:#3690CE; text-decoration:none;">
                      ${userEmail}
                    </a>
                  </td>
                  <td style="padding-right:4px; vertical-align:middle;">
                    <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/phone.png" alt="Phone Icon" style="height:12px; vertical-align:middle;" />
                  </td>
                  <td style="padding-right:15px; vertical-align:middle; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
                    <a href="tel:+443453142044" style="color:#0D2F60; text-decoration:none;">
                      0345 314 2044
                    </a>
                  </td>
                  <td style="padding-right:4px; vertical-align:middle;">
                    <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/website.png" alt="Website Icon" style="height:12px; vertical-align:middle;" />
                  </td>
                  <td style="padding-right:0; vertical-align:middle; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
                    <a href="https://www.helix-law.com/" style="color:#3690CE; text-decoration:none;">
                      www.helix-law.com
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px; padding-bottom: 8px; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4; ${forceTextColor}">
              <table border="0" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size:10pt; line-height:1.4;">
                <tr>
                  <td style="padding-right:4px; vertical-align:middle;">
                    <img src="https://helix-law.co.uk/wp-content/uploads/2025/01/location.png" alt="Location Icon" style="height:12px; vertical-align:middle;" />
                  </td>
                  <td style="vertical-align:middle; color:${finalLocationColor} !important; font-family: Raleway, sans-serif; font-size:10pt; line-height:1.4;">
                    Helix Law Ltd, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px; ${isDarkMode ? `color:${disclaimerColor} !important;` : `color:${disclaimerColor};`} font-size:7pt; line-height:1.5; font-family: Raleway, sans-serif;">
              DISCLAIMER: Please be aware of cyber-crime. Our bank account details will NOT change during the course of a transaction.
              Helix Law Limited will not be liable if you transfer money to an incorrect account.
              We accept no responsibility or liability for malicious or fraudulent emails purportedly coming from our firm,
              and it is your responsibility to ensure that any emails coming from us are genuine before relying on anything contained within them.
            </td>
          </tr>
          <tr>
            <td style="padding-top:8px; font-style:italic; font-size:7pt; line-height:1.5; ${effectiveIsDarkMode ? `color:${finalRegularTextColor} !important;` : `color:${finalRegularTextColor};`} font-family: Raleway, sans-serif;">
              Helix Law Limited is a limited liability company registered in England and Wales. Registration Number 07845461. A list of Directors is available for inspection at the Registered Office: Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE. Authorised and regulated by the Solicitors Regulation Authority. The term partner is a reference to a Director or senior solicitor of Helix Law Limited. Helix Law Limited does not accept service by email. This email is sent by and on behalf of Helix Law Limited. It may be confidential and may also be legally privileged. It is intended only for the stated addressee(s) and access to it by any other person is unauthorised. If you are not an addressee, you must not disclose, copy, circulate or in any other way use or rely on the information contained in this email. If you have received it in error, please inform us immediately and delete all copies. All copyright is reserved entirely on behalf of Helix Law Limited. Helix Law and applicable logo are exclusively owned trademarks of Helix Law Limited, registered with the Intellectual Property Office under numbers UK00003984532 and UK00003984535. The trademarks should not be used, copied or replicated without consent first obtained in writing.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />;
};

export default EmailSignature;

