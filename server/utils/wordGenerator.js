const path = require('path');
const { readFileSync, writeFileSync } = require('fs');
const createReport = require('docx-templates').default;
const JSZip = require('jszip');

// Fonts to replace with Raleway in the output .docx
const FONTS_TO_REPLACE = ['Calibri', 'Times New Roman', 'Arial', 'Cambria', 'Aptos'];

// All fields that may appear as {{placeholder}} in the template.
// Missing fields are defaulted to '' so docx-templates never throws
// ReferenceError for undefined variables.
const TEMPLATE_FIELDS = [
    'insert_clients_name', 'client_address', 'client_email', 'letter_date',
    'matter_number', 'matter', 'insert_heading_eg_matter_description',
    'name_of_person_handling_matter', 'status', 'name_of_handler', 'handler',
    'email', 'fee_earner_email', 'fee_earner_phone', 'fee_earner_postal_address',
    'name', 'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries',
    'insert_current_position_and_scope_of_retainer', 'next_steps',
    'realistic_timescale', 'next_stage', 'may_will', 'figure',
    'handler_hourly_rate', 'charges_estimate_paragraph', 'disbursements_paragraph',
    'costs_other_party_paragraph', 'figure_or_range', 'estimate',
    'in_total_including_vat_or_for_the_next_steps_in_your_matter',
    'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees',
    'and_or_intervals_eg_every_three_months',
    'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible',
    'identify_the_other_party_eg_your_opponents', 'simple_disbursements_estimate',
    'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement',
    'instructions_link', 'contact_details_for_marketing_opt_out',
    'state_amount', 'insert_consequence',
    'insert_next_step_you_would_like_client_to_take', 'state_why_this_step_is_important',
    'describe_first_document_or_information_you_need_from_your_client',
    'describe_second_document_or_information_you_need_from_your_client',
    'describe_third_document_or_information_you_need_from_your_client',
    'link_to_preference_centre',
];

async function generateWordFromJson(json, outPath) {
    // Ensure every template field has at least an empty-string default
    const data = {};
    for (const key of TEMPLATE_FIELDS) data[key] = '';
    Object.assign(data, json);

    const templatePath = path.join(process.cwd(), 'templates', 'cclTemplate.docx');
    const template = readFileSync(templatePath);
    const ctx = new Proxy({}, { get: () => () => '' });
    const buf = await createReport({
        template,
        data,
        cmdDelimiter: ['{{', '}}'],
        additionalJsContext: ctx
    });

    // Post-process: replace body fonts with Raleway for Helix house style
    const zip = await JSZip.loadAsync(buf);
    const xmlFiles = ['word/document.xml', 'word/styles.xml', 'word/fontTable.xml'];
    for (const fileName of xmlFiles) {
        const file = zip.file(fileName);
        if (file) {
            let xml = await file.async('string');
            for (const font of FONTS_TO_REPLACE) {
                const escaped = font.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                xml = xml.replace(new RegExp(`w:ascii="${escaped}"`, 'g'), 'w:ascii="Raleway"');
                xml = xml.replace(new RegExp(`w:hAnsi="${escaped}"`, 'g'), 'w:hAnsi="Raleway"');
                xml = xml.replace(new RegExp(`w:eastAsia="${escaped}"`, 'g'), 'w:eastAsia="Raleway"');
                // Replace font name declarations in fontTable
                xml = xml.replace(new RegExp(`w:name="${escaped}"`, 'g'), 'w:name="Raleway"');
            }
            zip.file(fileName, xml);
        }
    }
    const output = await zip.generateAsync({ type: 'nodebuffer' });
    writeFileSync(outPath, output);
}

module.exports = { generateWordFromJson };