/**
 * Rehearsal-record guards for demo / rehearsal instruction refs.
 *
 * Single source of truth for:
 *  - classifying a ref as a rehearsal/demo ref (HLX-27367-*, DEMO-*, HLX-DEMO-*)
 *  - deciding whether to short-circuit Clio writes (env flag CLIO_DRY_RUN_FOR_REHEARSAL_REFS)
 *  - resolving the NetDocuments upload folder per ref (REHEARSAL vs PROD)
 *
 * See docs/notes/HELIX_REHEARSAL_RECORD_LUKE_TEST_AS_FIRM_SEED.md (Phase C — C1 + C2).
 */

const REHEARSAL_REF_PATTERN = /^(HLX-27367-|DEMO-|HLX-DEMO-)/i;
const ND_FOLDER_FALLBACK = '4126-8772-0295'; // luke-sandbox in HELIX01-01

function isRehearsalRef(ref) {
  if (!ref) return false;
  return REHEARSAL_REF_PATTERN.test(String(ref).trim());
}

function isTruthyEnv(value) {
  if (!value) return false;
  const v = String(value).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function shouldDryRunClio(ref) {
  if (!isRehearsalRef(ref)) return false;
  return isTruthyEnv(process.env.CLIO_DRY_RUN_FOR_REHEARSAL_REFS);
}

function resolveNdFolderForRef(ref) {
  if (isRehearsalRef(ref)) {
    return process.env.CCL_ND_UPLOAD_FOLDER_REHEARSAL
      || process.env.CCL_ND_UPLOAD_FOLDER
      || ND_FOLDER_FALLBACK;
  }
  return process.env.CCL_ND_UPLOAD_FOLDER_PROD
    || process.env.CCL_ND_UPLOAD_FOLDER
    || ND_FOLDER_FALLBACK;
}

function syntheticClioContactResult({ instructionRef, clientType, count }) {
  const baseId = `dryrun-${Date.now()}`;
  const n = Math.max(1, Number(count) || 1);
  const results = [];
  for (let i = 0; i < n; i += 1) {
    results.push({
      id: `${baseId}-${i}`,
      type: clientType === 'Company' ? 'Company' : 'Person',
      name: `Rehearsal contact (${instructionRef})`,
      dryRun: true,
    });
  }
  return results;
}

function syntheticClioMatter({ instructionRef }) {
  const id = `dryrun-${Date.now()}`;
  return {
    id,
    display_number: `DRYRUN-${String(instructionRef || 'rehearsal').slice(-8)}`,
    description: `Dry-run matter for ${instructionRef || 'rehearsal'}`,
    status: 'open',
    dryRun: true,
  };
}

module.exports = {
  REHEARSAL_REF_PATTERN,
  isRehearsalRef,
  shouldDryRunClio,
  resolveNdFolderForRef,
  syntheticClioContactResult,
  syntheticClioMatter,
};
