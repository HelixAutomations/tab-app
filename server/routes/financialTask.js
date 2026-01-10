const express = require('express');
const { sql } = require('../utils/db');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const router = express.Router();

const KV_URI = "https://helix-keys.vault.azure.net/";
const ONEDRIVE_DRIVE_ID = "b!Yvwb2hcQd0Sccr_JiZEOOEqq1HfNiPFCs8wM4QfDlvVbiAZXWhpCS47xKdZKl8Vd";
const ASANA_PROJECT_ID = "1203336124217593";

// Form type to OneDrive folder mapping
const FORM_FOLDER_MAPPING = {
  "Payment Requests": "01SHVNVKRYLIPQGFSEVVDIOKCA6LR3LVFU",
  "Supplier Payment/Helix Expense": "01SHVNVKRFJFPCEFOND5C2PJMBMFYWAY7Y",
  "Transfer Request": "01SHVNVKQXD7PIEWD7W5C2JRE3SJR5FYTC",
  "General Query": "01SHVNVKSAMI5BILLCIRGIQV67ONCUBBNF"
};

// Form type to file field name mapping
const FILE_FIELD_MAPPING = {
  "Payment Requests": "Disbursement Upload",
  "Supplier Payment/Helix Expense": "Invoice Upload",
  "General Query": "Attachments"
};

// Get Asana credentials from SQL by team initials
async function getAsanaCredentials(initials) {
  const secretClient = new SecretClient(KV_URI, new DefaultAzureCredential());
  const passwordSecret = await secretClient.getSecret("sql-databaseserver-password");
  
  const pool = await sql.connect({
    server: "helix-database-server.database.windows.net",
    database: "helix-core-data",
    user: "helix-database-server",
    password: passwordSecret.value,
    options: { encrypt: true, enableArithAbort: true }
  });
  
  const result = await pool.request()
    .input('Initials', sql.NVarChar, initials.toUpperCase())
    .query(`
      SELECT [ASANAClient_ID], [ASANASecret], [ASANARefreshToken], [ASANAUser_ID]
      FROM [dbo].[team]
      WHERE UPPER([Initials]) = @Initials
    `);
  
  if (result.recordset.length === 0) return null;
  
  const row = result.recordset[0];
  return {
    clientId: row.ASANAClient_ID,
    secret: row.ASANASecret,
    refreshToken: row.ASANARefreshToken,
    userId: row.ASANAUser_ID
  };
}

// Refresh Asana access token
async function getAsanaAccessToken(credentials) {
  const { clientId, secret, refreshToken } = credentials;
  const tokenUrl = `https://app.asana.com/-/oauth_token?grant_type=refresh_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(secret)}&refresh_token=${encodeURIComponent(refreshToken)}`;
  
  const response = await fetch(tokenUrl, { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to refresh Asana token");
  }
  
  const data = await response.json();
  return data.access_token;
}

// Get Microsoft Graph access token
async function getGraphAccessToken() {
  const secretClient = new SecretClient(KV_URI, new DefaultAzureCredential());
  const [clientIdSecret, clientSecretSecret] = await Promise.all([
    secretClient.getSecret("graph-aidenteams-clientid"),
    secretClient.getSecret("graph-aiden-teamhub-financialattachments-clientsecret")
  ]);
  
  const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";
  const params = new URLSearchParams({
    client_id: clientIdSecret.value,
    scope: "https://graph.microsoft.com/.default",
    client_secret: clientSecretSecret.value,
    grant_type: "client_credentials"
  });
  
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  
  if (!response.ok) {
    throw new Error("Failed to get Graph token");
  }
  
  const data = await response.json();
  return data.access_token;
}

// Upload file to OneDrive
async function uploadFileToOneDrive(accessToken, folderId, fileName, fileContentBase64) {
  // Remove data URL prefix if present
  const commaIndex = fileContentBase64.indexOf(",");
  if (commaIndex > -1) {
    fileContentBase64 = fileContentBase64.substring(commaIndex + 1);
  }
  
  const fileBuffer = Buffer.from(fileContentBase64, "base64");
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${ONEDRIVE_DRIVE_ID}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;
  
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream"
    },
    body: fileBuffer
  });
  
  if (!response.ok) {
    throw new Error("OneDrive file upload failed");
  }
  
  return response.json();
}

// Create org-wide sharing link
async function createSharingLink(accessToken, itemId) {
  const url = `https://graph.microsoft.com/v1.0/drives/${ONEDRIVE_DRIVE_ID}/items/${itemId}/createLink`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ type: "view", scope: "organization" })
  });
  
  if (!response.ok) {
    throw new Error("Failed to create sharing link");
  }
  
  const result = await response.json();
  return result.link?.webUrl || "";
}

// Format data for task description
function formatDescription(data) {
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

// Sanitize data - replace file objects with just filename
function sanitizeDataForTask(data) {
  const sanitised = { ...data };
  for (const key in sanitised) {
    const value = sanitised[key];
    if (value && typeof value === 'object' && 'fileName' in value) {
      sanitised[key] = value.fileContent || value.base64 
        ? value.fileName 
        : `${value.fileName} (file content missing)`;
    }
  }
  return sanitised;
}

// POST /api/financial-task - Create financial task in Asana with OneDrive attachment
router.post('/', async (req, res) => {
  const { formType, data, initials } = req.body;

  const startedAt = Date.now();
  const arrLogId = req.get('x-arr-log-id');
  const contentLength = req.get('content-length');
  const dataKeys = data && typeof data === 'object' ? Object.keys(data) : [];

  // Trace (do not log values; may include sensitive financial data)
  console.log('[financial-task] Incoming request', {
    formType,
    initials,
    keys: dataKeys,
    keyCount: dataKeys.length,
    contentLength,
    arrLogId,
  });
  
  if (!formType || !data || !initials) {
    console.warn('[financial-task] Bad request (missing fields)', { formType, hasData: !!data, initials, arrLogId });
    return res.status(400).json({ error: "Missing formType, data, or initials in request body." });
  }
  
  try {
    // Get Asana credentials
    const asanaCredentials = await getAsanaCredentials(initials);
    if (!asanaCredentials) {
      console.warn('[financial-task] No Asana credentials for initials', { initials, arrLogId });
      return res.status(400).json({ error: "ASANA credentials not found for the provided initials." });
    }
    
    // Get Asana access token
    const asanaAccessToken = await getAsanaAccessToken(asanaCredentials);
    
    // Build description
    const sanitisedData = sanitizeDataForTask(data);
    let description = formatDescription(sanitisedData);
    
    // Add special notes
    const isOver50k =
      data["Is the amount you are sending over £50,000?"] === true ||
      data["Is the amount you are sending over £50,000"] === true ||
      data["Is the amount you are sending over £50k"] === true;

    if (formType === "Payment Requests" && isOver50k) {
      description += "\n\nPlease note we will need to perform an extra verification check. Accounts will send a small random amount and a random reference to the payee. You will need to ask them to confirm the amount and reference used before accounts can make the remaining balancing payment.";
    }
    
    if (formType === "Supplier Payment/Helix Expense" && data["Payment Type"] === "CHAPS (same day over £1m)") {
      description += "\n\nFor accounts/ whoever making payment - Please refer to this guide https://app.nuclino.com/Helix-Law-Limited/Team-Helix/CHAPS-Same-Day-Purpose-Codes-bc03cd9f-117c-4061-83a1-bdf18bd88072";
    }
    
    // Handle file upload to OneDrive
    const targetFolderId = FORM_FOLDER_MAPPING[formType];
    const fileFieldName = FILE_FIELD_MAPPING[formType];

    console.log('[financial-task] Attachment check', {
      formType,
      fileFieldName: fileFieldName || null,
      hasFilePayload: !!(fileFieldName && data && data[fileFieldName]),
      arrLogId,
    });
    
    if (targetFolderId && fileFieldName && data[fileFieldName]) {
      const fileData = data[fileFieldName];
      
      if (fileData.fileName && (fileData.fileContent || fileData.base64)) {
        try {
          const graphAccessToken = await getGraphAccessToken();
          const fileContentBase64 = fileData.fileContent || fileData.base64;
          const uploadResult = await uploadFileToOneDrive(graphAccessToken, targetFolderId, fileData.fileName, fileContentBase64);
          
          if (uploadResult?.id) {
            const sharingLink = await createSharingLink(graphAccessToken, uploadResult.id);
            if (sharingLink) {
              description += `\nUploaded File: ${uploadResult.name}\nLink: ${sharingLink}`;
            }

            console.log('[financial-task] OneDrive upload ok', {
              itemId: uploadResult.id,
              name: uploadResult.name,
              arrLogId,
            });
          }
        } catch (uploadError) {
          console.warn(`[financial-task] File upload failed: ${uploadError.message}`);
          if (fileData.fileName) {
            description += `\nFile mentioned: ${fileData.fileName} (upload failed)`;
          }
        }
      } else if (fileData.fileName) {
        description += `\nFile mentioned: ${fileData.fileName} (upload failed - missing file data)`;
      }
    }
    
    // Build task name
    const matterRef = data["Matter Reference"] || data["File/ Matter Reference"] || data["File Reference"];
    let taskLabel = formType;
    if (formType === "Write off/ Credit Note Request or Void invoice" && data["Type"]) {
      taskLabel = data["Type"];
    }
    const finalTaskName = matterRef ? `${matterRef} - ${taskLabel}` : taskLabel;
    
    // Create Asana task
    const today = new Date().toISOString().split("T")[0];
    const taskBody = {
      data: {
        projects: [ASANA_PROJECT_ID],
        name: finalTaskName,
        notes: description,
        due_on: today,
      }
    };
    
    if (data["Tag me as Collaborator"]) {
      taskBody.data.followers = [asanaCredentials.userId];
    }
    
    const asanaResponse = await fetch("https://app.asana.com/api/1.0/tasks", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${asanaAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(taskBody),
    });
    
    if (!asanaResponse.ok) {
      const errText = await asanaResponse.text();
      console.error('[financial-task] Asana error:', errText);
      throw new Error("Asana task creation failed");
    }
    
    const asanaResult = await asanaResponse.json();
    console.log(`[financial-task] Created Asana task: ${asanaResult.data?.gid}`, {
      arrLogId,
      ms: Date.now() - startedAt,
    });
    
    res.json({
      message: "Task created and OneDrive upload completed (if applicable).",
      asanaTask: asanaResult
    });
    
  } catch (error) {
    console.error('[financial-task] Error:', {
      message: error?.message,
      name: error?.name,
      arrLogId,
      ms: Date.now() - startedAt,
    });
    res.status(500).json({ error: error.message || "Unknown error occurred." });
  }
});

module.exports = router;
