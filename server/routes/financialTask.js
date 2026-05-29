const express = require('express');
const { sql, withRequest } = require('../utils/db');
const { getClient, getSecret } = require('../utils/getSecret');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const { trackRouteException } = require('../utils/errorContext');
const {
  recordSubmission,
  recordStep,
  markAwaitingHuman,
  markComplete,
  markFailed,
} = require('../utils/formSubmissionLog');
const router = express.Router();

const KV_URI = "https://helix-keys.vault.azure.net/";
const ONEDRIVE_DRIVE_ID = "b!Yvwb2hcQd0Sccr_JiZEOOEqq1HfNiPFCs8wM4QfDlvVbiAZXWhpCS47xKdZKl8Vd";
const ASANA_PROJECT_ID = "1203336124217593";
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID || "1203336123398249";
const ASANA_REQUESTED_SECTION_ID = process.env.ASANA_ACCOUNTS_REQUESTED_SECTION_ID || "1203336124217594";
const PAYMENT_REQUESTS_WEBHOOK_SECRET_NAME = 'payment-request-logic-app-url';
const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const UPLOAD_CHUNK_SIZE = 10 * 320 * 1024;
const ASANA_ATTACHMENTS_URL = 'https://app.asana.com/api/1.0/attachments';

function createHttpError(status, code, message, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function decodeBase64File(fileContentBase64) {
  let payload = String(fileContentBase64 || '');
  const commaIndex = payload.indexOf(',');
  if (commaIndex > -1) {
    payload = payload.substring(commaIndex + 1);
  }
  return Buffer.from(payload, 'base64');
}

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
  const connStr = process.env.SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('SQL_CONNECTION_STRING not configured');
  
  const result = await withRequest(connStr, async (request) => {
    return request
      .input('Initials', sql.NVarChar, initials.toUpperCase())
      .query(`
        SELECT [ASANAClient_ID], [ASANASecret], [ASANARefreshToken], [ASANAUser_ID]
        FROM [dbo].[team]
        WHERE UPPER([Initials]) = @Initials
      `);
  });
  
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
async function getAsanaAccessToken(credentials, requestId) {
  const { clientId, secret, refreshToken } = credentials;
  const tokenUrl = 'https://app.asana.com/-/oauth_token';

  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('client_id', String(clientId));
  body.append('client_secret', String(secret));
  body.append('refresh_token', String(refreshToken));

  const shouldRetry = (status) => status === 429 || (status >= 500 && status <= 599);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (response.ok || !shouldRetry(response.status) || attempt === 3) break;

    const backoffMs = attempt === 1 ? 350 : 900;
    console.warn('[financial-task] Asana token refresh transient failure; retrying', {
      status: response.status,
      attempt,
      backoffMs,
      requestId,
    });
    await sleep(backoffMs);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');

    // Asana typically returns JSON like { error: "invalid_grant", error_description: "..." }
    let safeDetails = '';
    if (errText) {
      try {
        const parsed = JSON.parse(errText);
        const e = typeof parsed?.error === 'string' ? parsed.error : '';
        const d = typeof parsed?.error_description === 'string' ? parsed.error_description : '';
        safeDetails = [e, d].filter(Boolean).join(' - ');
      } catch {
        safeDetails = errText.slice(0, 300);
      }
    }

    console.error('[financial-task] Asana token refresh failed', {
      status: response.status,
      details: safeDetails,
      requestId,
    });

    throw createHttpError(
      502,
      'ASANA_TOKEN_REFRESH_FAILED',
      'Failed to refresh Asana authorisation for your account.',
      safeDetails || `Upstream status ${response.status}`
    );
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw createHttpError(502, 'ASANA_TOKEN_REFRESH_FAILED', 'Asana token refresh returned no access token.', 'Missing access_token');
  }

  return data.access_token;
}

// Get Microsoft Graph access token
async function getGraphAccessToken() {
  const secretClient = getClient();
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
  const fileBuffer = decodeBase64File(fileContentBase64);

  if (fileBuffer.length <= SIMPLE_UPLOAD_MAX_BYTES) {
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
      const errText = await response.text().catch(() => '');
      throw new Error(`OneDrive file upload failed (${response.status}): ${errText.slice(0, 300) || 'no response body'}`);
    }

    return response.json();
  }

  const createSessionUrl = `https://graph.microsoft.com/v1.0/drives/${ONEDRIVE_DRIVE_ID}/items/${folderId}:/${encodeURIComponent(fileName)}:/createUploadSession`;
  const sessionResponse = await fetch(createSessionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'rename',
        name: fileName,
      },
    }),
  });

  if (!sessionResponse.ok) {
    const errText = await sessionResponse.text().catch(() => '');
    throw new Error(`OneDrive upload session creation failed (${sessionResponse.status}): ${errText.slice(0, 300) || 'no response body'}`);
  }

  const sessionPayload = await sessionResponse.json();
  if (!sessionPayload?.uploadUrl) {
    throw new Error('OneDrive upload session creation failed: missing uploadUrl');
  }

  let uploadedItem = null;

  for (let start = 0; start < fileBuffer.length; start += UPLOAD_CHUNK_SIZE) {
    const endExclusive = Math.min(start + UPLOAD_CHUNK_SIZE, fileBuffer.length);
    const chunk = fileBuffer.subarray(start, endExclusive);
    const endInclusive = endExclusive - 1;

    const chunkResponse = await fetch(sessionPayload.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${endInclusive}/${fileBuffer.length}`,
      },
      body: chunk,
    });

    if (!chunkResponse.ok) {
      const errText = await chunkResponse.text().catch(() => '');
      throw new Error(`OneDrive chunk upload failed (${chunkResponse.status}): ${errText.slice(0, 300) || 'no response body'}`);
    }

    if (endExclusive === fileBuffer.length) {
      uploadedItem = await chunkResponse.json();
    }
  }

  if (!uploadedItem?.id) {
    throw new Error('OneDrive upload completed without a drive item id');
  }

  return uploadedItem;
}

async function attachFileBufferToAsanaTask(accessToken, taskId, { fileName, fileType, fileBuffer }) {
  if (!fileName || !fileBuffer?.length) {
    throw new Error('Asana attachment failed: missing file payload');
  }
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    throw new Error('Asana attachment failed: FormData/Blob APIs unavailable');
  }

  const form = new FormData();
  form.append('parent', taskId);
  form.append(
    'file',
    new Blob([fileBuffer], { type: fileType || 'application/octet-stream' }),
    fileName
  );

  const response = await fetch(ASANA_ATTACHMENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Asana attachment upload failed (${response.status}): ${errText.slice(0, 300) || 'no response body'}`);
  }

  return response.json();
}

async function attachFileToAsanaTask(accessToken, taskId, fileData) {
  if (!fileData?.fileName || !(fileData.fileContent || fileData.base64)) {
    throw new Error('Asana attachment failed: missing file payload');
  }
  return attachFileBufferToAsanaTask(accessToken, taskId, {
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    fileBuffer: decodeBase64File(fileData.fileContent || fileData.base64),
  });
}

async function downloadOneDriveFile(accessToken, itemId, fileName) {
  if (!itemId) {
    throw new Error('OneDrive replay failed: missing drive item id');
  }
  const url = `https://graph.microsoft.com/v1.0/drives/${ONEDRIVE_DRIVE_ID}/items/${encodeURIComponent(itemId)}/content`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OneDrive replay download failed (${response.status}): ${errText.slice(0, 300) || 'no response body'}`);
  }
  const fileBuffer = Buffer.from(await response.arrayBuffer());
  return {
    fileName: fileName || 'financial-upload',
    fileType: response.headers.get('content-type') || 'application/octet-stream',
    fileBuffer,
  };
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

function findLatestStepOutput(submission, stepName, status = 'success') {
  const steps = Array.isArray(submission?.steps) ? submission.steps : [];
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step?.name === stepName && (!status || step.status === status)) {
      return step.output || null;
    }
  }
  return null;
}

async function retriggerFinancialTask(submission, { triggeredBy } = {}) {
  const submissionId = submission?.id;
  const asanaCreate = findLatestStepOutput(submission, 'asana.create', 'success');
  const oneDriveUpload = findLatestStepOutput(submission, 'onedrive.upload', 'success');
  const taskId = asanaCreate?.taskId;
  const itemId = oneDriveUpload?.itemId;

  if (!taskId || !itemId) {
    throw new Error('Financial retrigger needs an existing Asana task and a persisted OneDrive file from the original submission. The original file body is not stored in the process stream.');
  }

  const initials = String(submission?.submitted_by || triggeredBy || '').toUpperCase();
  const credentials = await getAsanaCredentials(initials);
  if (!credentials) {
    throw new Error(`Asana credentials not found for ${initials || 'submission owner'}`);
  }

  const requestId = `retrigger-${submissionId || Date.now().toString(36)}`;
  const asanaAccessToken = await getAsanaAccessToken(credentials, requestId);
  const graphAccessToken = await getGraphAccessToken();

  await recordStep(submissionId, {
    name: 'onedrive.download',
    status: 'processing',
    output: { itemId, fileName: oneDriveUpload?.fileName || oneDriveUpload?.name || null },
  });
  const fileData = await downloadOneDriveFile(graphAccessToken, itemId, oneDriveUpload?.fileName || oneDriveUpload?.name);
  await recordStep(submissionId, {
    name: 'onedrive.download',
    status: 'success',
    output: { itemId, fileName: fileData.fileName, sizeBytes: fileData.fileBuffer.length },
  });

  const attachStartedAt = Date.now();
  trackEvent('Forms.FinancialTask.RetriggerAttachment.Started', {
    operation: 'financialTask.retrigger',
    triggeredBy: triggeredBy || initials || 'unknown',
    submissionId,
    taskId,
    itemId,
    fileName: fileData.fileName,
  });

  try {
    const attachResult = await attachFileBufferToAsanaTask(asanaAccessToken, taskId, fileData);
    const attachmentId = attachResult?.data?.gid || '';
    await recordStep(submissionId, {
      name: 'asana.attach',
      status: 'success',
      output: { taskId, attachmentId, replayed: true },
    });
    trackEvent('Forms.FinancialTask.RetriggerAttachment.Completed', {
      operation: 'financialTask.retrigger',
      triggeredBy: triggeredBy || initials || 'unknown',
      submissionId,
      taskId,
      attachmentId,
      durationMs: Date.now() - attachStartedAt,
    });
    trackMetric('Forms.FinancialTask.RetriggerAttachment.Duration', Date.now() - attachStartedAt, {
      operation: 'financialTask.retrigger',
      triggeredBy: triggeredBy || initials || 'unknown',
    });
  } catch (error) {
    await recordStep(submissionId, {
      name: 'asana.attach',
      status: 'failed',
      error: error?.message || 'Unknown error',
      output: { taskId, itemId, replayed: true },
    });
    throw error;
  }
}

async function postPaymentRequestWebhook(data, requestId) {
  const operation = 'paymentRequestWebhook';
  const startedAt = Date.now();

  try {
    const webhookUrl = await getSecret(PAYMENT_REQUESTS_WEBHOOK_SECRET_NAME);
    if (!webhookUrl) {
      console.warn('[financial-task] Payment request webhook missing', { requestId });
      return;
    }

    trackEvent('Forms.PaymentRequestWebhook.Started', {
      operation,
      triggeredBy: 'financial-task',
      requestId,
    });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = createHttpError(
        response.status,
        'PAYMENT_REQUEST_WEBHOOK_FAILED',
        'Payment request webhook failed.',
        `Upstream status ${response.status}`
      );
      throw error;
    }

    const durationMs = Date.now() - startedAt;
    trackEvent('Forms.PaymentRequestWebhook.Completed', {
      operation,
      triggeredBy: 'financial-task',
      requestId,
      durationMs,
    });
    trackMetric('Forms.PaymentRequestWebhook.Duration', durationMs, {
      operation,
      triggeredBy: 'financial-task',
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.warn('[financial-task] Payment request webhook failed', {
      message: error?.message,
      requestId,
    });
    trackException(error instanceof Error ? error : new Error(String(error)), {
      operation,
      phase: 'postWebhook',
      requestId,
      triggeredBy: 'financial-task',
    });
    trackEvent('Forms.PaymentRequestWebhook.Failed', {
      operation,
      triggeredBy: 'financial-task',
      requestId,
      durationMs,
      error: error?.message || 'Unknown error',
    });
  }
}

// POST /api/financial-task - Create financial task in Asana with OneDrive attachment
router.post('/', async (req, res) => {
  const { formType, data, initials } = req.body;

  const startedAt = Date.now();
  const arrLogId = req.get('x-arr-log-id');
  const requestId = arrLogId || `local-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const contentLength = req.get('content-length');
  const dataKeys = data && typeof data === 'object' ? Object.keys(data) : [];
  const operation = 'createFinancialTask';

  // Trace (do not log values; may include sensitive financial data)
  console.log('[financial-task] Incoming request', {
    formType,
    initials,
    keys: dataKeys,
    keyCount: dataKeys.length,
    contentLength,
    requestId,
  });

  trackEvent('Forms.FinancialTask.Started', {
    operation,
    triggeredBy: initials || 'unknown',
    formType: formType || 'unknown',
    requestId,
  });
  
  if (!formType || !data || !initials) {
    console.warn('[financial-task] Bad request (missing fields)', { formType, hasData: !!data, initials, requestId });
    return res.status(400).json({
      error: 'Missing formType, data, or initials in request body.',
      code: 'BAD_REQUEST',
      requestId,
    });
  }

  // Record submission up-front (best-effort audit log). Bank details and file
  // bodies are stripped to a slim summary payload.
  let submissionId = null;
  try {
    const slimPayload = sanitizeDataForTask(data || {});
    submissionId = await recordSubmission({
      formKey: 'financial-task',
      submittedBy: String(initials || 'UNK').slice(0, 10),
      lane: 'Request',
      payload: { formType, data: slimPayload },
      summary: `Financial: ${formType}`.slice(0, 400),
      clientSubmissionId: req.body?.clientSubmissionId || null,
    });
  } catch (logErr) {
    trackException(logErr, { phase: 'financialTask.recordSubmission' });
  }
  
  try {
    // Get Asana credentials
    const asanaCredentials = await getAsanaCredentials(initials);
    if (!asanaCredentials) {
      console.warn('[financial-task] No Asana credentials for initials', { initials, requestId });
      return res.status(400).json({
        error: 'Asana credentials not found for your initials.',
        code: 'ASANA_CREDENTIALS_NOT_FOUND',
        requestId,
      });
    }
    
    // Get Asana access token
    const asanaAccessToken = await getAsanaAccessToken(asanaCredentials, requestId);
    
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
    let pendingAsanaAttachment = null;
    const attachmentStatus = {
      fileName: null,
      oneDriveUploaded: false,
      asanaAttached: false,
      warning: null,
    };

    console.log('[financial-task] Attachment check', {
      formType,
      fileFieldName: fileFieldName || null,
      hasFilePayload: !!(fileFieldName && data && data[fileFieldName]),
      requestId,
    });
    
    if (targetFolderId && fileFieldName && data[fileFieldName]) {
      const fileData = data[fileFieldName];
      
      if (fileData.fileName && (fileData.fileContent || fileData.base64)) {
        pendingAsanaAttachment = fileData;
        attachmentStatus.fileName = fileData.fileName;
        try {
          const graphAccessToken = await getGraphAccessToken();
          const fileContentBase64 = fileData.fileContent || fileData.base64;
          const uploadResult = await uploadFileToOneDrive(graphAccessToken, targetFolderId, fileData.fileName, fileContentBase64);
          
          if (uploadResult?.id) {
            let attachmentLink = uploadResult.webUrl || '';

            try {
              attachmentLink = await createSharingLink(graphAccessToken, uploadResult.id) || attachmentLink;
            } catch (sharingError) {
              console.warn('[financial-task] Sharing link creation failed, falling back to drive item URL', {
                itemId: uploadResult.id,
                message: sharingError?.message,
                requestId,
              });
            }

            if (attachmentLink) {
              description += `\nUploaded File: ${uploadResult.name}\nLink: ${attachmentLink}`;
            } else {
              description += `\nUploaded File: ${uploadResult.name} (uploaded successfully, no share link returned)`;
            }

            console.log('[financial-task] OneDrive upload ok', {
              itemId: uploadResult.id,
              name: uploadResult.name,
              requestId,
            });
            attachmentStatus.oneDriveUploaded = true;
            await recordStep(submissionId, {
              name: 'onedrive.upload',
              status: 'success',
              output: {
                itemId: uploadResult.id,
                name: uploadResult.name,
                fileName: fileData.fileName,
                webUrl: attachmentLink || uploadResult.webUrl || null,
              },
            });
          }
        } catch (uploadError) {
          console.warn(`[financial-task] File upload failed: ${uploadError.message}`);
          trackException(uploadError instanceof Error ? uploadError : new Error(String(uploadError)), {
            operation,
            phase: 'onedrive.upload',
            formType,
            requestId,
            fileName: fileData.fileName || 'unknown',
          });
          if (fileData.fileName && !pendingAsanaAttachment) {
            description += `\nFile mentioned: ${fileData.fileName} (upload failed)`;
          }
          attachmentStatus.warning = 'OneDrive upload failed; Asana attachment will still be attempted.';
          await recordStep(submissionId, {
            name: 'onedrive.upload',
            status: 'failed',
            error: uploadError?.message || 'Unknown error',
            output: { fileName: fileData.fileName || null },
          });
        }
      } else if (fileData.fileName) {
        attachmentStatus.fileName = fileData.fileName;
        description += `\nFile mentioned: ${fileData.fileName} (upload failed - missing file data)`;
        attachmentStatus.warning = 'File selected but no file data reached the server.';
        await recordStep(submissionId, {
          name: 'onedrive.upload',
          status: 'failed',
          error: 'File selected but no file data reached the server.',
          output: { fileName: fileData.fileName },
        });
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
        workspace: ASANA_WORKSPACE_ID,
        memberships: [{ section: ASANA_REQUESTED_SECTION_ID }],
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
      const errText = await asanaResponse.text().catch(() => '');
      console.error('[financial-task] Asana error:', {
        status: asanaResponse.status,
        body: errText ? errText.slice(0, 800) : '',
        requestId,
      });

      // Preserve upstream status where useful (often 4xx for auth), but avoid leaking sensitive content.
      if (submissionId) {
        await markFailed(submissionId, {
          lastEvent: 'asana.create:failed',
          error: new Error(`Asana task creation failed (${asanaResponse.status})`),
        });
      }
      return res.status(asanaResponse.status).json({
        error: 'Asana task creation failed.',
        details: errText ? errText.slice(0, 400) : undefined,
        code: 'ASANA_TASK_CREATE_FAILED',
        requestId,
      });
    }
    
    const asanaResult = await asanaResponse.json();
    console.log(`[financial-task] Created Asana task: ${asanaResult.data?.gid}`, {
      requestId,
      ms: Date.now() - startedAt,
    });
    await recordStep(submissionId, {
      name: 'asana.create',
      status: 'success',
      output: { taskId: asanaResult?.data?.gid, taskName: finalTaskName, projectId: ASANA_PROJECT_ID, sectionId: ASANA_REQUESTED_SECTION_ID },
    });

    if (pendingAsanaAttachment && asanaResult.data?.gid) {
      const attachStartedAt = Date.now();
      trackEvent('Forms.FinancialTask.AsanaAttachment.Started', {
        operation,
        triggeredBy: initials,
        formType,
        requestId,
        taskId: asanaResult.data.gid,
        fileName: pendingAsanaAttachment.fileName || 'unknown',
        sizeBytes: String(pendingAsanaAttachment.fileSize || ''),
      });

      try {
        const attachResult = await attachFileToAsanaTask(asanaAccessToken, asanaResult.data.gid, pendingAsanaAttachment);
        const attachmentId = attachResult?.data?.gid || '';
        attachmentStatus.asanaAttached = true;
        attachmentStatus.warning = null;
        console.log('[financial-task] Asana attachment upload ok', {
          attachmentId,
          taskId: asanaResult.data.gid,
          requestId,
        });
        trackEvent('Forms.FinancialTask.AsanaAttachment.Completed', {
          operation,
          triggeredBy: initials,
          formType,
          requestId,
          taskId: asanaResult.data.gid,
          attachmentId,
          durationMs: Date.now() - attachStartedAt,
        });
        trackMetric('Forms.FinancialTask.AsanaAttachment.Duration', Date.now() - attachStartedAt, {
          operation,
          triggeredBy: initials,
          formType,
        });
        await recordStep(submissionId, {
          name: 'asana.attach',
          status: 'success',
          output: { attachmentId },
        });
      } catch (attachError) {
        attachmentStatus.warning = 'Task created, but the file could not be attached in Asana.';
        console.warn('[financial-task] Asana attachment upload failed', {
          message: attachError?.message,
          taskId: asanaResult.data.gid,
          requestId,
        });
        trackException(attachError instanceof Error ? attachError : new Error(String(attachError)), {
          operation,
          phase: 'asana.attach',
          formType,
          requestId,
          taskId: asanaResult.data.gid,
          fileName: pendingAsanaAttachment.fileName || 'unknown',
        });
        trackEvent('Forms.FinancialTask.AsanaAttachment.Failed', {
          operation,
          triggeredBy: initials,
          formType,
          requestId,
          taskId: asanaResult.data.gid,
          durationMs: Date.now() - attachStartedAt,
          error: attachError?.message || 'Unknown error',
        });
        await recordStep(submissionId, {
          name: 'asana.attach',
          status: 'failed',
          error: attachError?.message || 'Unknown error',
          output: { taskId: asanaResult.data.gid },
        });
      }
    }

    if (formType === 'Payment Requests') {
      await postPaymentRequestWebhook(data, requestId);
    }

    const durationMs = Date.now() - startedAt;
    trackEvent('Forms.FinancialTask.Completed', {
      operation,
      triggeredBy: initials,
      formType,
      requestId,
      durationMs,
    });
    trackMetric('Forms.FinancialTask.Duration', durationMs, {
      operation,
      triggeredBy: initials,
      formType,
    });
    
    if (attachmentStatus.warning) {
      await markAwaitingHuman(submissionId, { lastEvent: 'financial task created; attachment warning' });
    } else {
      await markComplete(submissionId, { lastEvent: 'financial task created' });
    }
    
    res.json({
      message: attachmentStatus.warning || 'Task created. Attachment processed when applicable.',
      asanaTask: asanaResult,
      attachment: attachmentStatus.fileName ? attachmentStatus : undefined,
      submissionId,
      streamUrl: submissionId ? `forms?focusSubmission=${submissionId}` : null,
    });
    
  } catch (error) {
    console.error('[financial-task] Error:', {
      message: error?.message,
      name: error?.name,
      requestId,
      ms: Date.now() - startedAt,
    });

    trackRouteException(error instanceof Error ? error : new Error(String(error)), req, {
      operation,
      phase: 'route',
      requestId,
      triggeredBy: initials || 'unknown',
      formType: formType || 'unknown',
      formKey: 'financial-task',
      submissionId,
    });
    trackEvent('Forms.FinancialTask.Failed', {
      operation,
      triggeredBy: initials || 'unknown',
      formType: formType || 'unknown',
      requestId,
      durationMs: Date.now() - startedAt,
      error: error?.message || 'Unknown error',
    });

    const status = typeof error?.status === 'number' ? error.status : 500;
    const code = typeof error?.code === 'string' ? error.code : 'INTERNAL_ERROR';
    const details = typeof error?.details === 'string' ? error.details : undefined;

    if (submissionId) {
      await markFailed(submissionId, { lastEvent: `financial-task:${code}`, error });
    }

    res.status(status).json({
      error: error?.message || 'Unknown error occurred.',
      code,
      details,
      requestId,
    });
  }
});

module.exports = router;
module.exports.retriggerFinancialTask = retriggerFinancialTask;
