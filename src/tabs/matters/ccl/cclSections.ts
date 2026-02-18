import type { NormalizedMatter, TeamData } from '../../../app/functionality/types';
import type { CCLField } from './FieldInput';

export { type CCLField };

export interface CCLSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  fields: CCLField[];
}

export const CCL_SECTIONS: CCLSection[] = [
  {
    id: 'client',
    title: 'Client Details',
    description: 'Who is this letter addressed to?',
    icon: 'Contact',
    fields: [
      { key: 'insert_clients_name', label: 'Client Name', type: 'text', required: true, autoFilled: true },
      { key: 'client_address', label: 'Client Postal Address', type: 'text', placeholder: 'e.g. 123 High Street, Brighton, BN1 1AA' },
      { key: 'client_email', label: 'Client Email', type: 'text', autoFilled: true, placeholder: 'e.g. client@example.com' },
      { key: 'letter_date', label: 'Letter Date', type: 'text', autoFilled: true },
      { key: 'matter', label: 'Matter Type / Description', type: 'text', required: true, autoFilled: true },
      { key: 'insert_heading_eg_matter_description', label: 'Letter Heading', type: 'text', required: true },
    ],
  },
  {
    id: 'handler',
    title: 'Handler & Supervision',
    description: 'Who is responsible for this matter?',
    icon: 'People',
    fields: [
      { key: 'name_of_person_handling_matter', label: 'Handler Full Name', type: 'text', required: true, autoFilled: true },
      {
        key: 'status', label: 'Handler Status', type: 'select', required: true,
        options: [
          { key: 'Partner', text: 'Partner' },
          { key: 'Senior Associate', text: 'Senior Associate' },
          { key: 'Associate', text: 'Associate' },
          { key: 'Solicitor', text: 'Solicitor' },
          { key: 'Senior Partner', text: 'Senior Partner' },
          { key: 'Consultant', text: 'Consultant' },
          { key: 'Trainee Solicitor', text: 'Trainee Solicitor' },
        ],
      },
      { key: 'name_of_handler', label: 'Handler Short Name (first name)', type: 'text', autoFilled: true },
      { key: 'handler', label: 'Handler Reference (e.g. he/she)', type: 'select', options: [{ key: 'he', text: 'he' }, { key: 'she', text: 'she' }, { key: 'they', text: 'they' }] },
      { key: 'email', label: 'Preferred Contact Method', type: 'text', placeholder: 'e.g. by email at handler@helix-law.com' },
      { key: 'fee_earner_email', label: 'Fee Earner Email', type: 'text', autoFilled: true, placeholder: 'handler@helix-law.com' },
      { key: 'fee_earner_phone', label: 'Fee Earner Phone', type: 'text', autoFilled: true, placeholder: '01onal number' },
      { key: 'fee_earner_postal_address', label: 'Fee Earner Postal Address', type: 'textarea', autoFilled: true, placeholder: 'Office address for correspondence' },
      { key: 'name', label: 'Supervising Partner', type: 'text', autoFilled: true },
      { key: 'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries', label: 'Support Staff Contact', type: 'textarea', placeholder: 'Name and contact details of other team members' },
    ],
  },
  {
    id: 'scope',
    title: 'Scope & Next Steps',
    description: 'Define the retainer scope and immediate actions.',
    icon: 'TaskGroup',
    fields: [
      { key: 'insert_current_position_and_scope_of_retainer', label: 'Scope of Work', type: 'textarea', required: true, placeholder: 'Describe the current position and scope of retainer...' },
      { key: 'next_steps', label: 'Next Steps', type: 'textarea', placeholder: 'What are the next steps in this matter?' },
      { key: 'realistic_timescale', label: 'Realistic Timescale', type: 'text', placeholder: 'e.g. 4-6 weeks' },
      { key: 'next_stage', label: 'Next Stage / Milestone', type: 'text', placeholder: 'e.g. document review' },
      { key: 'may_will', label: 'May / Will', type: 'select', options: [{ key: 'may', text: 'may' }, { key: 'will', text: 'will' }], placeholder: 'Whether costs "may" or "will" be recovered' },
    ],
  },
  {
    id: 'costs',
    title: 'Costs & Charges',
    description: 'Set out the fee structure and estimates.',
    icon: 'Money',
    fields: [
      { key: 'figure', label: 'Payment on Account Amount (£)', type: 'text', placeholder: 'e.g. 2,500' },
      { key: 'handler_hourly_rate', label: 'Handler Hourly Rate (£)', type: 'text', placeholder: 'e.g. 395', autoFilled: true },
      { key: 'charges_estimate_paragraph', label: 'Charges Estimate', type: 'textarea', required: true, placeholder: 'e.g. I estimate the cost of the Initial Scope will be £X,XXX plus VAT.' },
      { key: 'disbursements_paragraph', label: 'Disbursements Detail', type: 'textarea', placeholder: 'e.g. We cannot give an exact figure for your disbursements, but this is likely to be in the region of £500...' },
      { key: 'costs_other_party_paragraph', label: 'Costs You May Have to Pay Another Party', type: 'textarea', placeholder: 'e.g. We do not expect that you will have to pay another party\'s costs.' },
      { key: 'figure_or_range', label: 'Cost Estimate Range', type: 'text', placeholder: 'e.g. 1,500 - 2,500' },
      { key: 'estimate', label: 'Estimate Amount', type: 'text', placeholder: 'e.g. £2,500 plus VAT' },
      { key: 'in_total_including_vat_or_for_the_next_steps_in_your_matter', label: 'Estimate Scope', type: 'select', options: [{ key: 'in total, including VAT', text: 'In total, including VAT' }, { key: 'for the next steps in your matter', text: 'For the next steps in your matter' }] },
      { key: 'give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees', label: 'Estimate Includes (examples)', type: 'textarea', placeholder: 'e.g. accountants report and court fees' },
      { key: 'and_or_intervals_eg_every_three_months', label: 'Billing Intervals', type: 'text', placeholder: 'e.g. every three months' },
      { key: 'we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible', label: 'Reason If No Estimate', type: 'textarea', placeholder: 'Why an overall estimate cannot be given' },
      { key: 'identify_the_other_party_eg_your_opponents', label: 'Opposing Party', type: 'text', placeholder: 'Name of opponent' },
      { key: 'simple_disbursements_estimate', label: 'Disbursements Estimate', type: 'text', placeholder: 'e.g. 500' },
      { key: 'explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement', label: 'Introducer Arrangement', type: 'textarea', placeholder: 'Nature of any referral/fee-sharing arrangement' },
      { key: 'instructions_link', label: 'Instructions Link', type: 'text', autoFilled: true, placeholder: 'Link to instruction portal' },
      { key: 'contact_details_for_marketing_opt_out', label: 'Marketing Opt-Out Contact', type: 'text', autoFilled: true, placeholder: 'e.g. info@helix-law.com' },
    ],
  },
  {
    id: 'actions',
    title: 'Action Points',
    description: 'Client action items and required documents.',
    icon: 'CheckList',
    fields: [
      { key: 'state_amount', label: 'Payment on Account Amount', type: 'text', placeholder: 'e.g. 2,500' },
      { key: 'insert_consequence', label: 'Consequence of Non-Payment', type: 'text', placeholder: 'e.g. we may not be able to start work' },
      { key: 'insert_next_step_you_would_like_client_to_take', label: 'Next Step for Client', type: 'text', placeholder: 'e.g. Provide signed authority form' },
      { key: 'state_why_this_step_is_important', label: 'Why This Step Is Important', type: 'text', placeholder: 'e.g. We cannot proceed without this' },
      { key: 'describe_first_document_or_information_you_need_from_your_client', label: 'Document Required (1)', type: 'text', placeholder: 'e.g. Copy of the contract' },
      { key: 'describe_second_document_or_information_you_need_from_your_client', label: 'Document Required (2)', type: 'text', placeholder: 'e.g. Correspondence with the other party' },
      { key: 'describe_third_document_or_information_you_need_from_your_client', label: 'Document Required (3)', type: 'text', placeholder: 'e.g. Any invoices or payment evidence' },
    ],
  },
];

export function autoFillFromMatter(matter: NormalizedMatter, teamData?: TeamData[] | null): Record<string, string> {
  const fields: Record<string, string> = {};

  fields.insert_clients_name = matter.clientName || '';
  fields.client_email = matter.clientEmail || '';
  // Format date as verbose British style (e.g. "18 June 2025")
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  fields.letter_date = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  fields.matter = matter.description || matter.practiceArea || '';

  let solicitorName = matter.responsibleSolicitor || '';

  // Resolve initials → full name using team data (Instructions pipeline stores
  // HelixContact initials like "BOD" instead of full names like "Bianca O'Donnell")
  if (teamData && solicitorName && /^[A-Z]{2,4}$/.test(solicitorName.trim())) {
    const byInitials = teamData.find(
      (t) => ((t as Record<string, unknown>)['Initials'] as string || '').toUpperCase() === solicitorName.trim().toUpperCase()
    );
    if (byInitials) {
      solicitorName = byInitials['Full Name'] || `${byInitials['First'] || ''} ${byInitials['Last'] || ''}`.trim() || solicitorName;
    }
  }

  fields.name_of_person_handling_matter = solicitorName;
  fields.name_of_handler = solicitorName.split(' ')[0] || solicitorName;

  if (teamData && solicitorName) {
    const member = teamData.find(
      (t) => {
        const fullName = t['Full Name'] || `${t['First'] || ''} ${t['Last'] || ''}`.trim();
        return fullName.toLowerCase() === solicitorName.toLowerCase();
      }
    );
    if (member) {
      const role = member['Role'] || '';
      if (role) fields.status = role;
      const email = member['Email'] || '';
      if (email) {
        fields.email = `by email at ${email}`;
        fields.fee_earner_email = email;
      }
      // Phone is always the firm number — no personal numbers on CCLs
      fields.fee_earner_phone = '0345 314 2044';

      // Derive handler pronoun (he/she/they) from first name
      // Source: team table active + recent members (Feb 2025)
      const pronounMap: Record<string, string> = {
        'alex': 'he', 'brendan': 'he', 'christopher': 'he', 'chris': 'he',
        'edwin': 'he', 'jonathan': 'he', 'joshua': 'he', 'josh': 'he',
        'lukasz': 'he', 'luke': 'he', 'richard': 'he', 'ryan': 'he',
        'sam': 'he', 'thaddeus': 'he', 'tristan': 'he', 'finlay': 'he',
        'jamie': 'he', 'gaige': 'he', 'billy': 'he', 'edward': 'he', 'ed': 'he',
        'bianca': 'she', 'fiona': 'she', 'fi': 'she', 'harkiran': 'she',
        'imogen': 'she', 'immy': 'she', 'laura': 'she', 'paris': 'she',
        'sophie': 'she', 'zoe-ann': 'she', 'cass': 'she', 'kanchel': 'she',
        'jennifer': 'she', 'jenny': 'she', 'anouszka': 'she', 'nush': 'she',
        'indie': 'she',
      };
      const firstName = (member['First'] || solicitorName.split(' ')[0] || '').toLowerCase().trim();
      const nickname = ((member as Record<string, unknown>)['Nickname'] as string || '').toLowerCase().trim();
      fields.handler = pronounMap[firstName] || pronounMap[nickname] || 'they';

      // Set hourly rate based on role
      const rateMap: Record<string, string> = {
        'Senior Partner': '475', 'Partner': '425',
        'Associate Solicitor': '350', 'Solicitor': '310',
        'Paralegal': '210', 'Trainee Solicitor': '210',
        'Consultant': '425',
      };
      fields.handler_hourly_rate = rateMap[role] || '425';
    }
  }

  // Default hourly rate if not set from team data
  if (!fields.handler_hourly_rate) fields.handler_hourly_rate = '425';

  // Default cost paragraphs (user should review/edit)
  fields.costs_other_party_paragraph = matter.opponent
    ? `There is a risk that you may have to pay ${matter.opponent} costs in this matter. This is explained in section 5, Funding and billing below.`
    : 'We do not expect that you will have to pay another party\'s costs. This only tends to arise in litigation and is therefore not relevant to your matter.';

  // Phone always firm number (not personal)
  if (!fields.fee_earner_phone) fields.fee_earner_phone = '0345 314 2044';

  // Standard defaults for compliance fields
  fields.contact_details_for_marketing_opt_out = 'info@helix-law.com';
  fields.fee_earner_postal_address = 'Helix Law, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE';

  fields.name = matter.supervisingPartner || '';

  // Support staff — supervising partner is the fallback contact
  if (matter.supervisingPartner && teamData) {
    const supervisor = teamData.find(t => {
      const fullName = t['Full Name'] || `${t['First'] || ''} ${t['Last'] || ''}`.trim();
      return fullName.toLowerCase() === (matter.supervisingPartner || '').toLowerCase();
    });
    if (supervisor) {
      const supEmail = supervisor['Email'] || '';
      const supRole = supervisor['Role'] || 'Partner';
      fields.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries =
        `${matter.supervisingPartner} — ${supEmail || '0345 314 2044'} — ${supRole}`;
    } else {
      fields.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries =
        `${matter.supervisingPartner} — 0345 314 2044`;
    }
  }
  fields.insert_heading_eg_matter_description =
    matter.description || `${matter.practiceArea} — ${matter.clientName}`;
  if (matter.opponent) {
    fields.identify_the_other_party_eg_your_opponents = matter.opponent;
  }
  fields.matter_number = matter.displayNumber || '';

  return fields;
}

export const DEMO_FIELDS: Record<string, string> = {
  insert_clients_name: 'Mr Luke Test',
  client_address: '123 Test Street\nBrighton\nBN1 1AA',
  client_email: 'luke.test@example.com',
  letter_date: '18 June 2025',
  matter: 'Commercial Dispute',
  insert_heading_eg_matter_description: 'Commercial Dispute — Mr Luke Test v Acme Corp',
  name_of_person_handling_matter: 'Rory McBride',
  status: 'Partner',
  name_of_handler: 'Rory',
  handler: 'he',
  email: 'by email at rory@helix-law.com',
  fee_earner_email: 'rory@helix-law.com',
  fee_earner_phone: '0345 314 2044',
  fee_earner_postal_address: 'Helix Law, Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE',
  name: 'Luke Watson',
  names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries: 'Luke Watson — luke@helix-law.com — Partner',
  insert_current_position_and_scope_of_retainer: 'You have a commercial dispute with Acme Corp regarding unpaid invoices totalling £45,000. We will review the contractual position, advise on merits and next steps, and correspond with the opponent to seek resolution.',
  next_steps: 'review the documents you have provided, advise on your position, and write a Letter Before Action to Acme Corp',
  realistic_timescale: '4-6 weeks',
  next_stage: 'document review and initial advice',
  may_will: 'may',
  figure: '2,500',
  handler_hourly_rate: '395',
  charges_estimate_paragraph: 'I estimate the cost of the Initial Scope will be £2,500 plus VAT.',
  disbursements_paragraph: 'We cannot give an exact figure for your disbursements, but this is likely to be in the region of £350 for the next steps in your matter.',
  costs_other_party_paragraph: 'There is a risk that you may have to pay Acme Corp costs in this matter. This is explained in section 5, Funding and billing below.',
  figure_or_range: '2,500',
  estimate: '£2,500 plus VAT',
  in_total_including_vat_or_for_the_next_steps_in_your_matter: 'for the next steps in your matter',
  give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees: '',
  and_or_intervals_eg_every_three_months: 'every three months',
  we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible: '',
  identify_the_other_party_eg_your_opponents: 'Acme Corp',
  simple_disbursements_estimate: '350',
  explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement: '',
  instructions_link: '',
  contact_details_for_marketing_opt_out: 'info@helix-law.com',
  state_amount: '2,500',
  insert_consequence: 'we may not be able to start work on your matter',
  insert_next_step_you_would_like_client_to_take: 'Provide signed authority form',
  state_why_this_step_is_important: 'We cannot correspond with the other party without your signed authority',
  describe_first_document_or_information_you_need_from_your_client: 'Copy of the contract with Acme Corp',
  describe_second_document_or_information_you_need_from_your_client: 'All correspondence with the other party',
  describe_third_document_or_information_you_need_from_your_client: 'Any invoices or payment evidence',
  matter_number: 'HELIX01-01',
};

export type EditorStepType = 'questionnaire' | 'editor' | 'preview';

export const STEPS: { key: EditorStepType; label: string; icon: string }[] = [
  { key: 'questionnaire', label: 'Details', icon: 'BulletedList2' },
  { key: 'editor', label: 'Editor', icon: 'Edit' },
  { key: 'preview', label: 'Preview', icon: 'EntryView' },
];
