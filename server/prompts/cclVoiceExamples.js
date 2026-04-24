/**
 * Helix CCL voice — worked examples.
 *
 * Few-shot examples per practice area for the highest-risk fields:
 *   - insert_current_position_and_scope_of_retainer
 *   - next_steps
 *   - state_why_this_step_is_important
 *   - insert_consequence
 *
 * Editing rule: every example must read like a senior Helix solicitor wrote
 * it. No "the firm". No "kindly". No "shall". Specific over generic.
 *
 * Consumed by `server/routes/ccl-ai.js` SYSTEM_PROMPT — appended after the
 * Helix Voice block. Bump CCL_PROMPT_VERSION when editing.
 */

const EXAMPLES = {
    commercial: {
        scenario: 'Shareholder dispute — minority shareholder seeking unfair prejudice relief.',
        fields: {
            insert_current_position_and_scope_of_retainer:
                'You have asked us to act on the unfair prejudice petition you intend to bring against your fellow shareholders. We will review the company documents and your correspondence, advise you on the strength of the petition, and prepare and issue proceedings under section 994 Companies Act 2006 if you decide to proceed.',
            next_steps:
                'review the shareholders\' agreement, the last three years of board minutes, and your correspondence with the other shareholders, then send you a written advice on the merits',
            state_why_this_step_is_important:
                'We need these to advise you properly. Without them we cannot test whether your petition meets the unfair prejudice threshold.',
            insert_consequence:
                'we will not be able to start work on your matter',
        },
    },
    property: {
        scenario: 'Commercial landlord seeking possession after tenant default.',
        fields: {
            insert_current_position_and_scope_of_retainer:
                'You have asked us to act in recovering possession of the premises at [ADDRESS] from the tenant in arrears. We will review the lease, advise you on the most efficient route to possession (forfeiture or section 25 notice), and take the agreed steps through to possession.',
            next_steps:
                'review the lease, the rent statement, and any prior correspondence with the tenant, then write to you within five working days with our recommended route to possession',
            state_why_this_step_is_important:
                'We need the lease and the rent statement to advise on whether forfeiture is available without risking a waiver argument.',
            insert_consequence:
                'we will not be able to take the next step in your matter',
        },
    },
    construction: {
        scenario: 'Subcontractor pursuing payment after wrongful pay-less notice.',
        fields: {
            insert_current_position_and_scope_of_retainer:
                'You have asked us to recover the £[AMOUNT] withheld by the main contractor under their pay-less notice dated [DATE]. We will review the notice and the underlying contract, advise you on whether to pursue adjudication, and run the adjudication on your behalf if you decide to proceed.',
            next_steps:
                'review the pay-less notice, the contract, and the underlying application for payment, then advise you within three working days on whether the notice is valid',
            state_why_this_step_is_important:
                'We need the notice and the contract to test whether the pay-less is out of time or otherwise defective — that decides whether we go to adjudication.',
            insert_consequence:
                'we will not be able to advise on the validity of the pay-less notice or start the adjudication',
        },
    },
    employment: {
        scenario: 'Senior employee seeking advice on settlement agreement.',
        fields: {
            insert_current_position_and_scope_of_retainer:
                'You have asked us to advise you on the settlement agreement your employer has offered. We will review the agreement, advise you on its terms (including the financial offer, restrictive covenants, and reference wording), and negotiate amendments where appropriate.',
            next_steps:
                'read the settlement agreement and the related correspondence, then call you to walk through the terms and the points we recommend negotiating',
            state_why_this_step_is_important:
                'We need the agreement and the surrounding correspondence to advise on whether the offer is reasonable and what to push back on.',
            insert_consequence:
                'we will not be able to advise you in time before the offer is withdrawn',
        },
    },
};

/**
 * Build a few-shot examples block for the system prompt. Returns the most
 * relevant practice area's example, or commercial as a sensible default.
 *
 * @param {string} practiceArea — one of commercial / property / construction / employment (case-insensitive)
 * @returns {string} examples block ready to append to the system prompt
 */
function buildVoiceExamplesBlock(practiceArea) {
    const key = String(practiceArea || '').toLowerCase().trim();
    const example = EXAMPLES[key] || EXAMPLES.commercial;
    const fieldLines = Object.entries(example.fields)
        .map(([field, value]) => `  ${field}:\n    "${value}"`)
        .join('\n\n');

    return `WORKED EXAMPLE (one practice-area example showing Helix voice in the highest-risk fields).
Scenario: ${example.scenario}
Voice notes: first person, names the document/step, no "shall"/"endeavour"/"kindly", short sentences, direct cause→effect.

${fieldLines}

Match this voice. The fields below should feel like the same hand wrote them.`;
}

module.exports = {
    EXAMPLES,
    buildVoiceExamplesBlock,
};
