export type CostsChoice = 'no_costs' | 'risk_costs' | null;
export type ChargesChoice = 'hourly_rate' | 'no_estimate' | null;
export type DisbursementsChoice = 'table' | 'estimate' | null;

export interface GenerationOptions {
    costsChoice: CostsChoice;
    chargesChoice: ChargesChoice;
    disbursementsChoice: DisbursementsChoice;
    showEstimateExamples: boolean;
}

export function generateTemplateContent(
    documentContent: string,
    templateFields: Record<string, string>,
    options: GenerationOptions,
    /** When true, resolve section choices but keep {{field}} placeholders so they can be rendered as inline-editable components. */
    keepPlaceholders?: boolean
): string {
    if (!documentContent) return documentContent;
    let content = documentContent;

    const { costsChoice, chargesChoice, disbursementsChoice, showEstimateExamples } = options;

    // When keepPlaceholders, always emit {{field}} so it renders as an inline-editable span.
    // When not, substitute the value or fall back to {{field}} for later cleanup.
    const fv = (key: string) => keepPlaceholders ? `{{${key}}}` : (templateFields[key] || `{{${key}}}`);

    const costsText = costsChoice === 'no_costs'
        ? "We do not expect that you will have to pay another party's costs. This only tends to arise in litigation and is therefore not relevant to your matter."
        : `There is a risk that you may have to pay ${fv('identify_the_other_party_eg_your_opponents')} costs in this matter. This is explained in section 5, Funding and billing below.`;
    content = content.replace(/\{\{costs_section_choice\}\}/g, costsText);

    const chargesText = chargesChoice === 'hourly_rate'
        ? `Our fees are calculated on the basis of an hourly rate. My rate is £{{handler_hourly_rate}} per hour. Other Partners/senior solicitors are charged at £395, Associate solicitors at £325, Solicitors at £285 and trainees and paralegals are charged at £195. All hourly rates will be subject to the addition of VAT.

Short incoming and outgoing letters, messages, emails and routine phone calls are charged at 1/10 of an hour. All other work is timed in six minute units and charged at the relevant hourly rate. Please note that lots of small emails or telephone calls may unnecessarily increase the costs to you.

I estimate the cost of the Initial Scope with be £${fv('figure')} plus VAT.`
        : `We cannot give an estimate of our overall charges in this matter because ${fv('we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible')}. The next stage in your matter is ${fv('next_stage')} and we estimate that our charges up to the completion of that stage will be in the region of £${fv('figure_or_range')}.

We reserve the right to increase the hourly rates if the work done is particularly complex or urgent, or the nature of your instructions require us to work outside normal office hours. If this happens, we will notify you in advance and agree an appropriate rate.

We will review our hourly rates on a periodic basis. This is usually done annually each January. We will give you advance notice of any change to our hourly rates.`;
    content = content.replace(/\{\{charges_section_choice\}\}/g, chargesText);

    const disbursementsText = disbursementsChoice === 'table'
        ? `Based on the information you have provided, we expect to incur the following disbursements:

Disbursement | Amount | VAT chargeable
[Describe disbursement] | £[Insert estimated amount] | [Yes OR No]
[Describe disbursement] | £[Insert estimated amount] | [Yes OR No]`
        : !showEstimateExamples
            ? `We cannot give an exact figure for your disbursements, but this is likely to be in the region of £${fv('simple_disbursements_estimate')} in total including VAT.`
            : (() => {
                const rawExamples = keepPlaceholders
                    ? `{{give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees}}`
                    : templateFields.give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees || '{{give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees}}';
                let formattedExamples = rawExamples;
                if (!keepPlaceholders && rawExamples && !rawExamples.startsWith('{{')) {
                    const selected: string[] = [];
                    if (rawExamples.includes('court fees')) selected.push('court fees');
                    if (rawExamples.includes('accountants report')) selected.push('accountants report');
                    if (selected.length === 0) {
                        formattedExamples = rawExamples;
                    } else if (selected.length === 1) {
                        formattedExamples = selected[0];
                    } else {
                        formattedExamples = selected.slice(0, -1).join(', ') + ' and ' + selected[selected.length - 1];
                    }
                }
                return `We cannot give an exact figure for your disbursements, but this is likely to be in the region of £${fv('simple_disbursements_estimate')} for the next steps in your matter including ${formattedExamples}.`;
            })();
    content = content.replace(/\{\{disbursements_section_choice\}\}/g, disbursementsText);

    if (!keepPlaceholders) {
        Object.keys(templateFields).forEach(key => {
            const value = templateFields[key];
            if (value && value.trim()) {
                const placeholder = `{{${key}}}`;
                content = content.replace(new RegExp(placeholder, 'g'), value);
            }
        });
    }

    return content;
}