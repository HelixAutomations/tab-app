// server/operatorActions/_pipelineHelpers.js
//
// Pure-function helpers ported from tools/instant-lookup.mjs's pipeline branch.
// These complement _personLookupHelpers.js and stay in parity with the CLI.

const sql = require('mssql');
const { resolveColumn } = require('./_personLookupHelpers');

const TENANT_ID = '7fbc252f-3ce5-460f-9740-4e1cb8bf78b8';

const parseInstructionRef = (raw) => {
  const input = String(raw || '').trim();
  if (!input) return null;
  const match = input.match(/^(?:[A-Z]+-?)?(\d+)-(\d+)$/i);
  if (!match) return null;
  const prospectId = match[1];
  const passcode = match[2];
  const hasPrefix = /^[A-Z]+-\d+-\d+$/i.test(input);
  const normalised = hasPrefix ? input.toUpperCase() : `HLX-${prospectId}-${passcode}`;
  return { instructionRef: normalised, prospectId, passcode };
};

const applyInParams = (request, values, prefix, sqlType) => {
  const paramNames = values.map((_, idx) => `${prefix}${idx}`);
  paramNames.forEach((name, idx) => request.input(name, sqlType, values[idx]));
  return paramNames.map((name) => `@${name}`).join(',');
};

const buildInClauseForColumns = (columns, values, request, columnCandidates, paramPrefix, sqlType = sql.VarChar) => {
  const clauses = [];
  let groupIndex = 0;
  for (const column of columnCandidates) {
    const resolved = resolveColumn(columns, [column]);
    if (!resolved) continue;
    const names = values.map((_, idx) => `${paramPrefix}${groupIndex}_${idx}`);
    names.forEach((name, idx) => request.input(name, sqlType, values[idx]));
    clauses.push(`[${resolved}] IN (${names.map((n) => `@${n}`).join(',')})`);
    groupIndex += 1;
  }
  if (clauses.length === 0) return null;
  return clauses.join(' OR ');
};

const generateTeamsDeepLink = (channelId, activityId, teamId, teamsMessageId, createdAtMs) => {
  if (!channelId || !teamId) return null;
  let messageId;
  if (teamsMessageId && Number(teamsMessageId) > 1640995200000) {
    messageId = teamsMessageId;
  } else if (createdAtMs && Number(createdAtMs) > 1640995200000) {
    messageId = createdAtMs;
  }
  if (!messageId) return null;
  const encChannel = encodeURIComponent(channelId);
  const encGroup = encodeURIComponent(teamId);
  const msgToken = encodeURIComponent(String(messageId));
  let channelName = 'General';
  if (channelId.includes('09c0d3669cd2464aab7db60520dd9180')) channelName = 'Commercial New Enquiries';
  else if (channelId.includes('2ba7d5a50540426da60196c3b2daf8e8')) channelName = 'Construction New Enquiries';
  else if (channelId.includes('6d09477d15d548a6b56f88c59b674da6')) channelName = 'Property New Enquiries';
  return `https://teams.microsoft.com/l/message/${encChannel}/${msgToken}?tenantId=${TENANT_ID}&groupId=${encGroup}&parentMessageId=${msgToken}&teamName=${encodeURIComponent('Helix Law')}&channelName=${encodeURIComponent(channelName)}&createdTime=${messageId}`;
};

module.exports = {
  parseInstructionRef,
  applyInParams,
  buildInClauseForColumns,
  generateTeamsDeepLink,
};
