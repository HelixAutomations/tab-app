import type { NormalizedMatter, TeamData } from '../../../app/functionality/types';
import type { CCLField } from './FieldInput';

export { type CCLField };

const ORIGINAL_CHARGES_PARAGRAPH = `I estimate the cost of the Initial Scope will be £{{figure}} plus VAT.

or

{{we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible}}. The next stage in your matter is {{next_stage}} and we estimate that our charges up to the completion of that stage will be in the region of £{{figure_or_range}}.]`;

const ORIGINAL_DISBURSEMENTS_PARAGRAPH = `[Based on the information you have provided, we do not expect disbursements to be a major feature at the outset of your matter. If third-party expenses become necessary, such as court fees, counsel's fees, expert fees, search fees or similar external costs, we will discuss them with you in advance and, where possible, give you an estimate before we incur them on your behalf.

OR

At this stage we cannot give an exact figure for your disbursements, but these are likely to be in the region of £{{estimate}} {{in_total_including_vat_or_for_the_next_steps_in_your_matter}} including {{give_examples_of_what_your_estimate_includes_eg_accountants_report_and_court_fees}}. We will discuss any significant disbursement with you before it is incurred on your behalf.]`;

const ORIGINAL_COSTS_OTHER_PARTY_PARAGRAPH = `We do not expect that you will have to pay another party's costs. This only tends to arise in litigation and is therefore not relevant to your matter.

OR

There is a risk that you may have to pay {{identify_the_other_party_eg_your_opponents}} costs in this matter. This is explained in section 5, Funding and billing below.`;

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
      { key: 'insert_heading_eg_matter_description', label: 'Letter Heading (RE: line)', type: 'text', required: true },
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
          { key: 'Director', text: 'Director' },
          { key: 'Partner', text: 'Partner' },
          { key: 'Senior Solicitor', text: 'Senior Solicitor' },
          { key: 'Associate Solicitor', text: 'Associate Solicitor' },
          { key: 'Solicitor', text: 'Solicitor' },
          { key: 'Trainee Solicitor', text: 'Trainee Solicitor' },
          { key: 'Paralegal', text: 'Paralegal' },
          { key: 'Consultant', text: 'Consultant' },
        ],
      },
      { key: 'fee_earner_email', label: 'Fee Earner Email', type: 'text', autoFilled: true, placeholder: 'handler@helix-law.com' },
      { key: 'handler_hourly_rate', label: 'Handler Hourly Rate (£)', type: 'text', placeholder: 'e.g. 475', autoFilled: true },
      { key: 'name', label: 'Supervising Partner', type: 'text', autoFilled: true },
      { key: 'names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries', label: 'Support Staff Contact', type: 'textarea', placeholder: 'Name and contact details of other team members' },
    ],
  },
  {
    id: 'scope',
    title: 'Scope of Retainer',
    description: 'Define the retainer scope.',
    icon: 'TaskGroup',
    fields: [
      { key: 'insert_current_position_and_scope_of_retainer', label: 'Scope of Work', type: 'textarea', required: true, placeholder: 'Describe the current position and scope of retainer...' },
    ],
  },
  {
    id: 'costs',
    title: 'Costs & Charges',
    description: 'Set out the fee structure and estimates.',
    icon: 'Money',
    fields: [
      { key: 'charges_estimate_paragraph', label: 'Charges Estimate', type: 'textarea', required: true, placeholder: 'e.g. I estimate the cost of the Initial Scope will be in the region of £X,XXX to £X,XXX plus VAT.' },
      { key: 'disbursements_paragraph', label: 'Disbursements Detail', type: 'textarea', placeholder: 'e.g. We do not anticipate significant disbursements at this stage.' },
      { key: 'costs_other_party_paragraph', label: 'Costs Other Party', type: 'textarea', placeholder: 'e.g. We do not expect that you will have to pay another party\'s costs.' },
      { key: 'figure', label: 'Payment on Account (£)', type: 'text', placeholder: 'e.g. 2,500' },
      { key: 'fee_sharing_paragraph', label: 'Fee Sharing Arrangement', type: 'textarea', placeholder: 'Leave blank if no fee sharing arrangement' },
    ],
  },
  {
    id: 'aml',
    title: 'AML / EID',
    description: 'Identity verification status.',
    icon: 'Shield',
    fields: [
      { key: 'eid_paragraph', label: 'EID Verification', type: 'textarea', placeholder: 'e.g. We will obtain electronic verification of your identity using a search service.' },
    ],
  },
  {
    id: 'actions',
    title: 'Action Points',
    description: 'Client action items and required documents.',
    icon: 'CheckList',
    fields: [
      { key: 'action_points', label: 'Action Points', type: 'textarea', placeholder: 'e.g. - Provide all relevant contractual documentation' },
      { key: 'documents_needed', label: 'Documents Needed', type: 'textarea', placeholder: 'e.g. Copy of the contract, all correspondence with the other party' },
      { key: 'action_points_next_steps', label: 'Next Steps After Actions', type: 'text', placeholder: 'e.g. review the documents and prepare a detailed letter of advice' },
    ],
  },
];

export function autoFillFromMatter(matter: NormalizedMatter, teamData?: TeamData[] | null): Record<string, string> {
  const fields: Record<string, string> = {};

  fields.insert_clients_name = matter.clientName || '';
  fields.insert_heading_eg_matter_description =
    matter.description || `${matter.practiceArea} — ${matter.clientName}`;

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
        fields.fee_earner_email = email;
      }

      // Set hourly rate based on role
      const rateMap: Record<string, string> = {
        'Director': '475', 'Senior Partner': '475', 'Partner': '425',
        'Senior Solicitor': '425', 'Associate Solicitor': '350', 'Solicitor': '310',
        'Paralegal': '210', 'Trainee Solicitor': '210',
        'Consultant': '425',
      };
      fields.handler_hourly_rate = rateMap[role] || '425';
    }
  }

  // Default hourly rate if not set from team data
  if (!fields.handler_hourly_rate) fields.handler_hourly_rate = '425';

  // Aliases — template uses multiple keys for the same handler name
  fields.handler = fields.name_of_person_handling_matter;
  fields.name_of_handler = fields.name_of_person_handling_matter;

  // Email alias — "best way to contact" uses {{email}}
  fields.email = fields.fee_earner_email || '';

  // Phone — shared firm number (no per-person direct dial)
  fields.fee_earner_phone = fields.fee_earner_phone || '0345 314 2044';

  // Postal address — firm address
  fields.fee_earner_postal_address = 'Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE';

  // Matter reference fields
  fields.matter_number = matter.displayNumber || '';
  fields.matter = matter.description || '';

  // Marketing opt-out contact
  fields.contact_details_for_marketing_opt_out = 'team@helix-law.com';

  // Default EID paragraph
  fields.eid_paragraph = 'We will obtain electronic verification of your identity using a search service. This search has no impact on your credit history.';

  // Resolve supervising partner first name → full name using team data
  let supervisingName = matter.supervisingPartner || '';
  if (teamData && supervisingName && !supervisingName.includes(' ')) {
    const match = teamData.find(t => {
      const first = (t['First'] || (t['Full Name'] || '').split(/\s+/)[0] || '').trim();
      return first.toLowerCase() === supervisingName.toLowerCase();
    });
    if (match) {
      supervisingName = match['Full Name'] || `${match['First'] || ''} ${match['Last'] || ''}`.trim() || supervisingName;
    }
  }
  fields.name = supervisingName;

  // Support staff — supervising partner is the fallback contact
  if (supervisingName && teamData) {
    const supervisor = teamData.find(t => {
      const fullName = t['Full Name'] || `${t['First'] || ''} ${t['Last'] || ''}`.trim();
      return fullName.toLowerCase() === supervisingName.toLowerCase();
    });
    if (supervisor) {
      const supEmail = supervisor['Email'] || '';
      const supRole = supervisor['Role'] || 'Partner';
      fields.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries =
        `${supervisingName} — ${supEmail || '0345 314 2044'} — ${supRole}`;
    } else {
      fields.names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries =
        `${supervisingName} — 0345 314 2044`;
    }
  }

  // Opponent auto-fill — from matter data
  if (matter.opponent) {
    fields.identify_the_other_party_eg_your_opponents = matter.opponent;
  }

  // Section 4.1 — Charges estimate default (original template primary alternative)
  fields.charges_estimate_paragraph = ORIGINAL_CHARGES_PARAGRAPH;

  // Section 4.2 — Disbursements default (original template scaffold)
  fields.disbursements_paragraph = ORIGINAL_DISBURSEMENTS_PARAGRAPH;

  // Section 4.3 — Costs other party default (original template scaffold)
  fields.costs_other_party_paragraph = ORIGINAL_COSTS_OTHER_PARTY_PARAGRAPH;

  // Section 7 — costs update cadence default
  fields.and_or_intervals_eg_every_three_months = ', when appropriate';

  // Section 16 — Referral default (no introducer for most Helix matters)
  fields.explain_the_nature_of_your_arrangement_with_any_introducer_for_link_to_sample_wording_see_drafting_note_referral_and_fee_sharing_arrangement =
    'There is no referral or fee sharing arrangement in respect of this matter.';

  // Section 17 — Cancellation notice reference
  fields.instructions_link = '[instruction platform — link to follow]';

  return fields;
}

export const DEMO_FIELDS: Record<string, string> = {
  insert_clients_name: 'Mr Luke Test',
  insert_heading_eg_matter_description: 'Commercial Dispute — Mr Luke Test v Acme Corp',
  name_of_person_handling_matter: 'Rory McBride',
  status: 'Partner',
  fee_earner_email: 'rory@helix-law.com',
  handler_hourly_rate: '425',
  name: 'Luke Watson',
  names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries: 'Luke Watson — luke@helix-law.com — Partner',
  insert_current_position_and_scope_of_retainer: 'You have a commercial dispute with Acme Corp regarding unpaid invoices totalling £45,000. We will review the contractual position, advise on merits and next steps, and correspond with the opponent to seek resolution.',
  charges_estimate_paragraph: ORIGINAL_CHARGES_PARAGRAPH,
  disbursements_paragraph: ORIGINAL_DISBURSEMENTS_PARAGRAPH,
  costs_other_party_paragraph: ORIGINAL_COSTS_OTHER_PARTY_PARAGRAPH,
  figure: '2,500',
  fee_sharing_paragraph: '',
  eid_paragraph: 'We will obtain electronic verification of your identity using a search service. This search has no impact on your credit history.',
  action_points: '- Provide all relevant contractual documentation\n- Provide all correspondence with Acme Corp\n- Provide supporting invoices and payment records',
  documents_needed: 'Copy of the contract with Acme Corp, all correspondence with the other party, and any invoices or payment evidence.',
  action_points_next_steps: 'review the documents and prepare a detailed letter of advice on the merits of your position',
};

export type EditorStepType = 'questionnaire' | 'editor' | 'preview';

export const STEPS: { key: EditorStepType; label: string; icon: string }[] = [
  { key: 'questionnaire', label: 'Details', icon: 'BulletedList2' },
  { key: 'editor', label: 'Editor', icon: 'Edit' },
  { key: 'preview', label: 'Preview', icon: 'EntryView' },
];
