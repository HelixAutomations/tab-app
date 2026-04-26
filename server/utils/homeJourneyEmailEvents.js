const sql = require('mssql');
const { randomUUID } = require('crypto');
const { getPool } = require('./db');
const { deleteCachePattern } = require('./redisClient');

let emailEventsTableReady = false;

function instrPool() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return getPool(connStr);
}

function buildRecipientSummary(toRecipients, ccRecipients) {
  const recipients = [...toRecipients, ...ccRecipients].filter(Boolean);
  if (recipients.length === 0) return 'No recipients recorded';
  if (recipients.length === 1) return recipients[0];
  if (recipients.length === 2) return `${recipients[0]} and ${recipients[1]}`;
  return `${recipients[0]}, ${recipients[1]} +${recipients.length - 2}`;
}

async function ensureHomeJourneyEmailEventsTable() {
  if (emailEventsTableReady) return true;

  try {
    const pool = await instrPool();
    await pool.request().query(`
      IF OBJECT_ID('dbo.HomeJourneyEmailEvents', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.HomeJourneyEmailEvents (
          EventId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
          SentAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
          SenderEmail NVARCHAR(255) NOT NULL,
          SenderInitials NVARCHAR(16) NULL,
          RecipientSummary NVARCHAR(255) NULL,
          ToRecipientsJson NVARCHAR(MAX) NULL,
          CcRecipientsJson NVARCHAR(MAX) NULL,
          BccRecipientsJson NVARCHAR(MAX) NULL,
          Subject NVARCHAR(500) NULL,
          Source NVARCHAR(80) NULL,
          ContextLabel NVARCHAR(120) NULL,
          EnquiryRef NVARCHAR(80) NULL,
          InstructionRef NVARCHAR(80) NULL,
          MatterRef NVARCHAR(80) NULL,
          ClientRequestId NVARCHAR(80) NULL,
          GraphRequestId NVARCHAR(80) NULL,
          MetadataJson NVARCHAR(MAX) NULL
        );

        CREATE INDEX IX_HomeJourneyEmailEvents_SentAt
          ON dbo.HomeJourneyEmailEvents (SentAt DESC);
        CREATE INDEX IX_HomeJourneyEmailEvents_Sender
          ON dbo.HomeJourneyEmailEvents (SenderInitials, SenderEmail, SentAt DESC);
      END
    `);

    emailEventsTableReady = true;
    return true;
  } catch (error) {
    emailEventsTableReady = false;
    throw error;
  }
}

async function invalidateHomeJourneyCache() {
  try {
    await deleteCachePattern('home-journey:*');
  } catch {
    // non-fatal cache invalidation
  }
}

async function recordHomeJourneyEmailEvent(event) {
  await ensureHomeJourneyEmailEventsTable();

  const eventId = event.eventId || randomUUID();
  const sentAt = event.sentAt || new Date().toISOString();
  const toRecipients = Array.isArray(event.toRecipients) ? event.toRecipients : [];
  const ccRecipients = Array.isArray(event.ccRecipients) ? event.ccRecipients : [];
  const bccRecipients = Array.isArray(event.bccRecipients) ? event.bccRecipients : [];
  const metadataJson = event.metadata ? JSON.stringify(event.metadata) : null;
  const recipientSummary = event.recipientSummary || buildRecipientSummary(toRecipients, ccRecipients);

  const pool = await instrPool();
  await pool.request()
    .input('EventId', sql.UniqueIdentifier, eventId)
    .input('SentAt', sql.DateTime2, new Date(sentAt))
    .input('SenderEmail', sql.NVarChar, String(event.senderEmail || '').trim().toLowerCase())
    .input('SenderInitials', sql.NVarChar, event.senderInitials || null)
    .input('RecipientSummary', sql.NVarChar, recipientSummary)
    .input('ToRecipientsJson', sql.NVarChar, JSON.stringify(toRecipients))
    .input('CcRecipientsJson', sql.NVarChar, JSON.stringify(ccRecipients))
    .input('BccRecipientsJson', sql.NVarChar, JSON.stringify(bccRecipients))
    .input('Subject', sql.NVarChar, event.subject || null)
    .input('Source', sql.NVarChar, event.source || null)
    .input('ContextLabel', sql.NVarChar, event.contextLabel || null)
    .input('EnquiryRef', sql.NVarChar, event.enquiryRef || null)
    .input('InstructionRef', sql.NVarChar, event.instructionRef || null)
    .input('MatterRef', sql.NVarChar, event.matterRef || null)
    .input('ClientRequestId', sql.NVarChar, event.clientRequestId || null)
    .input('GraphRequestId', sql.NVarChar, event.graphRequestId || null)
    .input('MetadataJson', sql.NVarChar, metadataJson)
    .query(`
      INSERT INTO dbo.HomeJourneyEmailEvents (
        EventId,
        SentAt,
        SenderEmail,
        SenderInitials,
        RecipientSummary,
        ToRecipientsJson,
        CcRecipientsJson,
        BccRecipientsJson,
        Subject,
        Source,
        ContextLabel,
        EnquiryRef,
        InstructionRef,
        MatterRef,
        ClientRequestId,
        GraphRequestId,
        MetadataJson
      )
      VALUES (
        @EventId,
        @SentAt,
        @SenderEmail,
        @SenderInitials,
        @RecipientSummary,
        @ToRecipientsJson,
        @CcRecipientsJson,
        @BccRecipientsJson,
        @Subject,
        @Source,
        @ContextLabel,
        @EnquiryRef,
        @InstructionRef,
        @MatterRef,
        @ClientRequestId,
        @GraphRequestId,
        @MetadataJson
      )
    `);

  await invalidateHomeJourneyCache();
  return eventId;
}

module.exports = {
  ensureHomeJourneyEmailEventsTable,
  invalidateHomeJourneyCache,
  recordHomeJourneyEmailEvent,
};