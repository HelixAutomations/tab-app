/**
 * Helix Voice — shared voice/tone rules for every outbound AI surface.
 *
 * One source of truth. Consumed by:
 *   - CCL generator (`server/routes/ccl-ai.js` — SYSTEM_PROMPT)
 *   - CCL Safety Net (`server/routes/ccl-ai.js` — PRESSURE_TEST_SYSTEM_PROMPT)
 *   - Communication Frameworks (`server/prompts/communication-frameworks.js`)
 *
 * Voice owner: LZ. Change here → changes everywhere. Bump the
 * consumer's prompt version when editing.
 */

const HELIX_VOICE_BLOCK = `HELIX VOICE (hard rules — these override generic legal register):

Register
- First person: we / I / us / our. Never "the firm" or "the solicitor".
- Direct address: "you". Never "the client" in body copy.
- British English. Plain, modern. Short sentences preferred.
- Warm but not sycophantic. Confident, not stiff.

Word-level bans (rewrite if a draft contains any of these):
- "kindly", "please be advised", "hereinafter", "aforementioned", "the same"
- "endeavour", "shall" (use "will"), "obtain" (use "get" where register allows)
- "in due course" (replace with a specific time)
- "appropriate", "relevant", "necessary" — only if followed by what; otherwise cut
- Empty acknowledgements: "we note that", "we confirm that", "we would like to"
- Sandwich hedges: "it is likely to be the case that…"

Specificity
- Name the document, the step, the deadline, the £ figure. No "the relevant materials".
- One clause where one will do. Cut every word that adds no information.
- Active voice. Direct cause → direct effect.

Cadence
- Avoid paragraphs > 4 sentences. Break long thoughts into bullets where the template allows prose.
- Vary sentence length. Don't stack three short sentences in a row unless for emphasis.

What Helix never sounds like
- Insurance-form boilerplate
- Big-four corporate memo
- AI assistant ("I'd be happy to help…")
- Over-apologetic ("sorry for the inconvenience")`;

/**
 * Voice-axis rubric for the Safety Net pressure test. Appended to the PT
 * system prompt so every flagged field is scored on BOTH evidence fidelity
 * AND Helix voice. A field can be factually correct but off-voice — we
 * want to catch both.
 */
const HELIX_VOICE_PT_AXIS = `VOICE SCORING (separate axis from evidence fidelity):

For every field, also return a "voiceScore" (0-10) against the Helix Voice rules below. A field must clear BOTH evidence (score) and voice (voiceScore) thresholds to go unflagged. Flag (flag: true) if EITHER score ≤ 7 OR voiceScore ≤ 7.

Voice rubric:
- 10 = sounds like a senior Helix solicitor wrote it: first person, specific, direct, zero filler
- 8-9 = on-voice, one minor wording preference only
- 7 = generic professional-legal register; not off-brand but not distinctly Helix
- ≤ 6 = contains banned words ("kindly", "shall", "endeavour", "the firm", "please be advised", "hereinafter", empty "we note that/we confirm that/we would like to"), passive voice throughout, or padded/stilted phrasing

Also return "voiceIssues": a short array of specific phrases from the field that you'd rewrite. Empty array if nothing.

Per-field response shape:
{ "score": int, "voiceScore": int, "reason": "<evidence reason>", "voiceIssues": ["<phrase>", ...], "flag": bool }`;

module.exports = {
    HELIX_VOICE_BLOCK,
    HELIX_VOICE_PT_AXIS,
};
