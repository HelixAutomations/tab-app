export const FIELD_DISPLAY_NAMES = {
    insert_clients_name: "Client Name",
    insert_heading_eg_matter_description: "Matter Heading",
    matter: "Matter Type",
    name_of_person_handling_matter: "Handler Name",
    status: "Handler Status",
    name_of_handler: "Handler Short Name",
    handler: "Handler Reference",
    email: "Contact Method",
    insert_current_position_and_scope_of_retainer: "Scope of Work",
    next_steps: "Next Actions",
    realistic_timescale: "Timeline",
    next_stage: "Next Milestone",
    figure: "Payment Amount",
    figure_or_range: "Cost Estimate",
    we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible: "No Estimate Reason",
    estimate: "Disbursement Estimate",
    in_total_including_vat_or_for_the_next_steps_in_your_matter: "Estimate Scope",
    give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees: "Estimate Includes",
    identify_the_other_party_eg_your_opponents: "Opposing Party",
    may_will: "Litigation Likelihood",
    and_or_intervals_eg_every_three_months: "Cost Update Frequency",
    contact_details_for_marketing_opt_out: "Marketing Contact",
    link_to_preference_centre: "Preference Centre URL",
    explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement: "Referral Arrangement",
    instructions_link: "Cancellation Instructions URL",
    name: "Supervisor Name",
    names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries: "Support Staff",
    name_of_firm: "Firm Name",
    simple_disbursements_estimate: "Simple Estimate Amount",
    detailed_disbursements_examples: "Detailed Examples",
    detailed_disbursements_total: "Detailed Total",
    disbursement_1_description: "Disbursement 1 Description",
    disbursement_1_amount: "Disbursement 1 Amount",
    disbursement_1_vat: "Disbursement 1 VAT",
    disbursement_1_notes: "Disbursement 1 Notes",
    disbursement_2_description: "Disbursement 2 Description",
    disbursement_2_amount: "Disbursement 2 Amount",
    disbursement_2_vat: "Disbursement 2 VAT",
    disbursement_2_notes: "Disbursement 2 Notes",
    disbursement_3_description: "Disbursement 3 Description",
    disbursement_3_amount: "Disbursement 3 Amount",
    disbursement_3_vat: "Disbursement 3 VAT",
    disbursement_3_notes: "Disbursement 3 Notes",
    insert_next_step_you_would_like_client_to_take: "Next Step for Client",
    state_why_this_step_is_important: "Step Importance",
    state_amount: "Payment Amount",
    describe_first_document_or_information_you_need_from_your_client: "First Document Required",
    describe_second_document_or_information_you_need_from_your_client: "Second Document Required",
    describe_third_document_or_information_you_need_from_your_client: "Third Document Required",
    matter_number: "Matter Reference Number",
    handler_hourly_rate: "Hourly Rate",
    charges_estimate_paragraph: "Charges Estimate",
    disbursements_paragraph: "Disbursements Detail",
    costs_other_party_paragraph: "Other Party Costs",
    fee_earner_email: "Fee Earner Email",
    fee_earner_phone: "Fee Earner Phone",
    fee_earner_postal_address: "Postal Address",
    insert_consequence: "Non-Payment Consequence",
};

export const FIELD_PRESETS: Record<string, string[]> = {
    insert_clients_name: [
        "Mr. John Smith",
        "Mrs. Sarah Johnson",
        "Ms. Emily Davis",
        "Dr. Michael Brown",
        "Mr. and Mrs. Williams"
    ],
    matter: [
        "Commercial Property Purchase",
        "Residential Property Sale",
        "Business Acquisition",
        "Employment Dispute",
        "Contract Negotiation"
    ],
    name_of_person_handling_matter: [
        "John Williams",
        "Sarah Mitchell",
        "Michael Thompson",
        "Emily Roberts",
        "David Anderson"
    ],
    status: [
        "Senior Associate",
        "Partner",
        "Associate",
        "Senior Partner",
        "Consultant"
    ],
    next_steps: [
        "Review and sign the attached documents",
        "Provide requested documentation",
        "Attend the scheduled meeting",
        "Review the draft contract",
        "Complete the client questionnaire"
    ],
    next_stage: [
        "document review",
        "contract negotiation",
        "completion",
        "exchange of contracts",
        "due diligence"
    ],
    figure: [
        "500",
        "1,000",
        "1,500",
        "2,500",
        "3,000"
    ],
    figure_or_range: [
        "2,000-3,000",
        "5,000-7,500",
        "1,500-2,500",
        "3,000-5,000",
        "10,000-15,000"
    ],
    we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible: [
        "the scope of work is unclear at this stage",
        "it depends on the complexity of negotiations",
        "the matter involves multiple unknown variables",
        "we need more information about your requirements",
        "the timeline and scope may change significantly"
    ],
    identify_the_other_party_eg_your_opponents: [
        "the seller",
        "the buyer",
        "the landlord",
        "the tenant",
        "the opposing party",
        "the defendant",
        "the claimant",
        "the other party's",
        "your opponent's"
    ],
    estimate: [
        "500",
        "1000",
        "1500",
        "2000",
        "3000"
    ],
    in_total_including_vat_or_for_the_next_steps_in_your_matter: [
        "in total including VAT",
        "for the next steps in your matter",
        "including VAT and expenses",
        "total estimate including all costs"
    ],
    give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees: [
        "court fees and search fees",
        "accountants report and valuation",
        "Land Registry fees and searches",
        "expert witness fees and reports",
        "administrative costs and postage"
    ],
    insert_next_step_you_would_like_client_to_take: [
        "telephone me to discuss this letter and the next steps in your matter",
        "review and sign the enclosed documentation",
        "provide the requested information and documents",
        "attend the scheduled meeting or consultation",
        "confirm your instructions and preferred approach"
    ],
    state_why_this_step_is_important: [
        "This will help us understand your priorities and proceed efficiently",
        "This is required to move forward with your matter",
        "Without this, there may be delays in progressing your case",
        "This will ensure we are acting in accordance with your wishes",
        "This step is necessary to comply with legal requirements"
    ],
    state_amount: [
        "500",
        "1,000",
        "1,500",
        "2,000",
        "2,500"
    ],
    describe_first_document_or_information_you_need_from_your_client: [
        "Copy of your passport or driving licence",
        "Recent utility bill confirming your address",
        "Contract or agreement relating to this matter",
        "Correspondence from the other party",
        "Financial statements or accounts"
    ],
    describe_second_document_or_information_you_need_from_your_client: [
        "Bank statements for the last 3 months",
        "Proof of income or employment",
        "Insurance policy documents",
        "Previous legal correspondence",
        "Property deeds or title documents"
    ],
    describe_third_document_or_information_you_need_from_your_client: [
        "Details of any previous legal proceedings",
        "Contact details for relevant third parties",
        "Company registration documents (if applicable)",
        "Power of attorney (if acting for someone else)",
        "Any other relevant documentation"
    ]
};
