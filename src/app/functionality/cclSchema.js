/**
 * Default Draft CCL merge field schema.
 * Each key corresponds to a token in the Word template.
 */
const schema = {
    insert_clients_name: '',
    insert_heading_eg_matter_description: '',
    matter: '',
    name_of_person_handling_matter: '',
    status: '',
    names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries: '',
    email: '',
    name: '',
    supervisor_role: 'Partner',
    insert_current_position_and_scope_of_retainer: '',
    next_steps: '',
    realistic_timescale: '',
    we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible: '',
    next_stage: '',
    figure_or_range: '',
    estimate: '',
    in_total_including_vat_or_for_the_next_steps_in_your_matter: '',
    give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees: '',
    identify_the_other_party_eg_your_opponents: '',
    figure: '',
    and_or_intervals_eg_every_three_months: '',
    contact_details_for_marketing_opt_out: '',
    link_to_preference_centre: '',
    may_will: '',
    handler: '',
    name_of_handler: '',
    fee_earner_phone: '',
    fee_earner_email: '',
    fee_earner_postal_address: '',
    explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement: '',
    instructions_link: ''
};

const tokens = Object.keys(schema);

module.exports = { schema, tokens };