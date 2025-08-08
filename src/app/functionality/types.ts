export type SectionName = 'Favorites' | 'General_Processes' | 'Operations' | 'Financial';
// invisible change 2

export interface Tab {
  key: string;
  text: string;
  disabled?: boolean;
}

import React from 'react';

export interface FormItem {
  title: string;
  url?: string;
  icon: string;
  tags?: string[];
  description?: string;
  embedScript?: {
    key: string;
    formId: string;
  };
  fields?: Array<{
    label: string;
    type: 'text' | 'number' | 'textarea' | 'dropdown' | 'toggle' | 'currency-picker' | 'file' | 'message';
    options?: string[];
    step?: number;
    editable?: boolean;
    required?: boolean;
    defaultValue?: boolean | string | number | File;
    prefix?: string;
    helpText?: string;
    placeholder?: string;
    showIf?: { field: string; equals: any };
  }>;
  component?: React.ComponentType<any>;
}

// Define the structure for UserData
export interface UserData {
  CreatedDate?: string;
  CreatedTime?: string;
  FullName?: string;
  Last?: string;
  First?: string;
  Nickname?: string;
  Initials?: string;
  Email?: string;
  EntraID?: string; // Maps to [Entra ID]
  ClioID?: string;
  Rate?: number;
  Role?: string;
  ASANA_ID?: string;
  ASANAUserID?: string;
  ASANAPendingID?: number;
  ASANAInProgressID?: number;
  ASANATeamID?: number;
  AOW?: string; // Area of Work
  ASANAClientID?: string;
  ASANASecret?: string;
  ASANARefreshToken?: string;
  // Database snake_case versions for compatibility
    ASANAClient_ID?: string;
    ASANA_Secret?: string;
    ASANARefresh_Token?: string;
    holiday_entitlement?: number; // Added holiday entitlement field
    status?: string;
  }

// Define the structure for Enquiry
export interface Enquiry {
  ID: string;
  Date_Created: string;
  Touchpoint_Date: string;
  Email: string;
  Area_of_Work: string;
  Type_of_Work: string;
  Method_of_Contact: string;
  Point_of_Contact: string;
  Company?: string;
  Website?: string;
  Title?: string;
  First_Name: string;
  Last_Name: string;
  DOB?: string;
  Phone_Number?: string;
  Secondary_Phone?: string;
  Tags?: string;
  Unit_Building_Name_or_Number?: string;
  Mailing_Street?: string;
  Mailing_Street_2?: string;
  Mailing_Street_3?: string;
  Postal_Code?: string;
  City?: string;
  Mailing_County?: string;
  Country?: string;
  Gift_Rank?: number;
  Matter_Ref?: string;
  Value?: string;
  Call_Taker?: string;
  Ultimate_Source?: string;
  Contact_Referrer?: string;
  Referring_Company?: string;
  Other_Referrals?: string;
  Referral_URL?: string;
  Campaign?: string;
  Ad_Group?: string;
  Search_Keyword?: string;
  GCLID?: string;
  Initial_first_call_notes?: string;
  Do_not_Market?: string;
  IP_Address?: string;
  TDMY?: string;
  TDN?: string;
  pocname?: string;
  Rating?: 'Good' | 'Neutral' | 'Poor';
  Employment?: string;
  Divorce_Consultation?: string;
  Web_Form?: string; // Added Web_Form
}

// Define the structure for EnquiryDb (matches SQL table)
export interface EnquiryDb {
  id: number;
  datetime: string; // ISO string with date and time
  stage?: string | null;
  claim?: string | null; // ISO string with date and time, nullable
  poc?: string | null;
  pitch?: number | null;
  aow?: string | null;
  tow?: string | null;
  moc?: string | null;
  rep?: string | null;
  first?: string | null;
  last?: string | null;
  email?: string | null;
  phone?: string | null;
  value?: string | null;
  notes?: string | null;
  rank?: string | null;
  rating?: string | null;
  acid?: string | null;
  card_id?: string | null;
  source?: string | null;
  url?: string | null;
  contact_referrer?: string | null;
  company_referrer?: string | null;
  gclid?: string | null;
}

// Define the structure for Matter
// Raw matter interface (legacy)
export interface Matter {
  MatterID?: string;
  InstructionRef?: string;
  DisplayNumber: string;
  OpenDate: string;
  MonthYear: string;
  YearMonthNumeric: number;
  ClientID: string;
  ClientName: string;
  ClientPhone: string;
  ClientEmail: string;
  Status: string;
  UniqueID: string;
  Description: string;
  PracticeArea: string;
  Source: string;
  Referrer: string;
  ResponsibleSolicitor: string;
  OriginatingSolicitor: string;
  SupervisingPartner: string;
  Opponent: string;
  OpponentSolicitor: string;
  CloseDate: string;
  ApproxValue: string;
  mod_stamp: string;
  method_of_contact: string;
  CCL_date: string | null;
  Rating?: 'Good' | 'Neutral' | 'Poor';
}

// Normalized matter interface for consistent UI rendering
export interface NormalizedMatter {
  // Core identifiers
  matterId: string;
  matterName: string;
  displayNumber: string;
  instructionRef?: string;
  
  // Dates
  openDate: string;
  closeDate: string | null;
  
  // Status derived from closeDate
  status: 'active' | 'closed';
  // Original/raw status from source system (e.g., MatterRequest, Active, Closed)
  originalStatus?: string;
  
  // Client information
  clientId: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  
  // Matter details
  description: string;
  practiceArea: string;
  source?: string;
  referrer?: string;
  value?: string;
  
  // Solicitors
  responsibleSolicitor: string;
  originatingSolicitor: string;
  supervisingPartner?: string;
  
  // Opposition
  opponent?: string;
  opponentSolicitor?: string;
  
  // User role (computed)
  role: 'responsible' | 'originating' | 'both' | 'none';
  
  // Metadata
  methodOfContact?: string;
  cclDate?: string | null;
  rating?: 'Good' | 'Neutral' | 'Poor';
  modStamp?: string;
  
  // Source tracking
  dataSource: 'legacy_all' | 'legacy_user' | 'vnet_direct';
  
  // Raw data for debugging
  _raw?: any;
}

// Define the structure for POID data
export interface POID {
  poid_id: string; // Primary key
  type?: string;
  terms_acceptance?: boolean;
  submission_url?: string;
  submission_date?: string; // ISO format for datetime
  id_docs_folder?: string;
  acid?: number;
  card_id?: string;
  poc?: string; // Point of Contact
  nationality_iso?: string;
  nationality?: string;
  gender?: string;
  first?: string; // First Name
  last?: string; // Last Name
  prefix?: string; // Title (Mr, Mrs, etc.)
  date_of_birth?: string; // ISO format for date
  best_number?: string; // Phone Number
  email?: string;
  passport_number?: string;
  drivers_license_number?: string;
  house_building_number?: string;
  street?: string;
  city?: string;
  county?: string;
  post_code?: string;
  country?: string;
  country_code?: string;
  company_name?: string;
  company_number?: string;
  company_house_building_number?: string;
  company_street?: string;
  company_city?: string;
  company_county?: string;
  company_post_code?: string;
  company_country?: string;
  company_country_code?: string;
  stage?: string;
  check_result?: string;
  pep_sanctions_result?: string;
  address_verification_result?: string;
  check_expiry?: string;
  check_id?: string;
  additional_id_submission_id?: string;
  additional_id_submission_url?: string;
  additional_id_submission_date?: string;
  client_id?: string;
  related_client_id?: string;
  matter_id?: string;
  risk_assessor?: string;
  risk_assessment_date?: string; // ISO format for date
}

export interface IDVerification {
  InternalId: number;
  InstructionRef?: string | null;
  MatterId?: string | null;
  DealJointClientId?: number | null;
  ClientId?: number | null;
  ProspectId?: number | null;
  ClientEmail?: string | null;
  IsLeadClient?: boolean;
  AdditionalIDDate?: string | null;
  AdditionalIDTime?: string | null;
  EIDCheckId?: string;
  EIDProvider?: string;
  EIDStatus?: string;
  EIDScore?: number | null;
  EIDRawResponse?: string;
  EIDCheckedDate?: string | null;
  EIDCheckedTime?: string | null;
  CheckExpiry?: string | null;
  EIDOverallResult?: string | null;
  PEPAndSanctionsCheckResult?: string | null;
  AddressVerificationResult?: string | null;
}

// Define the structure for TeamData
export interface TeamData {
  "Created Date"?: string;
  "Created Time"?: string;
  "Full Name"?: string;
  "Last"?: string;
  "First"?: string;
  "Nickname"?: string;
  "Initials"?: string;
  "Email"?: string;
  "Entra ID"?: string;
  "Clio ID"?: string;
  "Rate"?: number;
  "Role"?: string;
  "AOW"?: string;
  "status"?: string;
  holiday_entitlement?: number;
}

export interface Currency {
  id: number | null;
  redacted?: boolean;
}

export interface OutstandingClientContact {
  id: number;
  etag: string;
  name: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  date_of_birth: string;
  type: string;
  created_at: string;
  updated_at: string;
  prefix?: string | null;
  title: string;
  initials: string;
  clio_connect_email?: string | null;
  locked_clio_connect_email?: string | null;
  client_connect_user_id?: string | null;
  primary_email_address: string;
  secondary_email_address?: string | null;
  primary_phone_number: string;
  secondary_phone_number?: string | null;
  ledes_client_id?: string | null;
  has_clio_for_clients_permission: boolean;
  is_client: boolean;
  is_clio_for_client_user: boolean;
  is_co_counsel: boolean;
  is_bill_recipient: boolean;
  sales_tax_number?: string | null;
  currency: { id: number | null };
}

export interface OutstandingBill {
  id: number;
  etag: string;
  number: string;
  issued_at: string;
  created_at: string;
  due_at: string;
  tax_rate: number;
  secondary_tax_rate: number;
  updated_at: string;
  subject?: string | null;
  purchase_order?: string | null;
  type: string;
  memo?: string | null;
  start_at: string;
  end_at: string;
  balance: number;
  state: string;
  kind: string;
  total: number;
  paid: number;
  paid_at?: string | null;
  pending: number;
  due: number;
  discount_services_only: boolean;
  can_update: boolean;
  credits_issued: number;
  shared: boolean;
  last_sent_at?: string | null;
  services_secondary_tax: number;
  services_sub_total: number;
  services_tax: number;
  services_taxable_sub_total: number;
  services_secondary_taxable_sub_total: number;
  taxable_sub_total: number;
  secondary_taxable_sub_total: number;
  sub_total: number;
  tax_sum: number;
  secondary_tax_sum: number;
  total_tax: number;
  available_state_transitions: string[];
}

export interface OutstandingClientContact {
  id: number;
  etag: string;
  name: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  date_of_birth: string;
  type: string;
  created_at: string;
  updated_at: string;
  prefix?: string | null;
  title: string;
  initials: string;
  clio_connect_email?: string | null;
  locked_clio_connect_email?: string | null;
  client_connect_user_id?: string | null;
  primary_email_address: string;
  secondary_email_address?: string | null;
  primary_phone_number: string;
  secondary_phone_number?: string | null;
  ledes_client_id?: string | null;
  has_clio_for_clients_permission: boolean;
  is_client: boolean;
  is_clio_for_client_user: boolean;
  is_co_counsel: boolean;
  is_bill_recipient: boolean;
  sales_tax_number?: string | null;
  currency: { id: number | null };
}

export interface OutstandingBill {
  id: number;
  etag: string;
  number: string;
  issued_at: string;
  created_at: string;
  due_at: string;
  tax_rate: number;
  secondary_tax_rate: number;
  updated_at: string;
  subject?: string | null;
  purchase_order?: string | null;
  type: string;
  memo?: string | null;
  start_at: string;
  end_at: string;
  balance: number;
  state: string;
  kind: string;
  total: number;
  paid: number;
  paid_at?: string | null;
  pending: number;
  due: number;
  discount_services_only: boolean;
  can_update: boolean;
  credits_issued: number;
  shared: boolean;
  last_sent_at?: string | null;
  services_secondary_tax: number;
  services_sub_total: number;
  services_tax: number;
  services_taxable_sub_total: number;
  services_secondary_taxable_sub_total: number;
  taxable_sub_total: number;
  secondary_taxable_sub_total: number;
  sub_total: number;
  tax_sum: number;
  secondary_tax_sum: number;
  total_tax: number;
  available_state_transitions: string[];
}

export interface OutstandingClientBalance {
  id: number;
  created_at: string;
  updated_at: string;
  associated_matter_ids: number[];
  contact: OutstandingClientContact;
  total_outstanding_balance: number;
  last_payment_date: string;
  last_shared_date?: string | null;
  newest_issued_bill_due_date: string;
  pending_payments_total: number;
  reminders_enabled: boolean;
  currency: { id: number | null; redacted?: boolean };
  outstanding_bills: OutstandingBill[];
}

export interface OutstandingClientBalancesResponse {
  meta: {
    paging: any; // Customize this type if you have more details on the paging object
    records: number;
  };
  data: OutstandingClientBalance[];
}

export interface Transaction {
  intake_id: number;
  intake_date: string;
  transaction_id: string;
  matter_ref: string;
  matter_description: string;
  fe: string;
  amount: number;
  transaction_date: string;
  from_client: boolean;
  money_sender: string | null;
  type: string;
  status?: string | null; // new field added
  task_id?: string | null; // add task_id here
}


export interface BoardroomBooking {
  id: number;
  fee_earner: string;       // Fee earner's initials
  booking_date: string;     // Format: 'YYYY-MM-DD'
  booking_time: string;     // Format: 'HH:MM:SS' (or with fraction, e.g. 'HH:MM:SS.0000000')
  duration: number;         // Duration in hours (decimal values allowed)
  reason: string;           // Reason for booking
  created_at: string;       // Timestamp when created
  updated_at: string;       // Timestamp when updated
  spaceType: 'Boardroom';
}

export interface SoundproofPodBooking {
  id: number;
  fee_earner: string;       // Fee earner's initials
  booking_date: string;     // Format: 'YYYY-MM-DD'
  booking_time: string;     // Format: 'HH:MM:SS' (or with fraction, e.g. 'HH:MM:SS.0000000')
  duration: number;         // Duration in hours (decimal values allowed)
  reason: string;           // Reason for booking
  created_at: string;       // Timestamp when created
  updated_at: string;       // Timestamp when updated
  spaceType: 'Soundproof Pod';
}

// Union type for when you want to use both together.
export type SpaceBooking = BoardroomBooking | SoundproofPodBooking;

export interface FutureBookingsResponse {
  boardroomBookings: BoardroomBooking[];
  soundproofBookings: SoundproofPodBooking[];
}

export interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  id: string;
  rejection_notes?: string;
  approvers?: string[];
  hearing_confirmation?: string;
  hearing_details?: string;
  days_taken?: number;
  leave_type?: string;
}

export interface InstructionData {
  id?: string;
  title?: string;
  description?: string;
  prospectId: number;
  deals: any[];
  /**
   * Joint clients associated with the prospect.  Older implementations
   * used the `jointClients` field while newer ones may expose this data
   * via `joinedClients`.  Both shapes are captured here.
   */
  jointClients: any[];
  joinedClients?: any[];
  instructions: any[];
  documents: any[];
  /**
   * Compliance/risk assessment details.  Depending on the backend
   * version this may be returned under `riskAssessments` or
   * `compliance`.  Consumers should handle either form.
   */
  riskAssessments: any[];
  compliance?: any[];

  /**
   * Electronic ID verification results.  May be returned as
   * `electronicIDChecks` or `idVerifications`.
   */
  electronicIDChecks: any[];
  idVerifications?: any[];
  
  /**
   * Matter information embedded within the instruction data.
   */
  matter?: any;
  
  /**
   * Array of matters associated with this prospect.
   */
  matters?: any[];
}

export interface CCLJson {
  header: string;
  scopeOfWork: string;
  fees: string;
  terms: string;
  signatures: string;
}