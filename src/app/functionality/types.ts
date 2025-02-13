// src/app/functionality/types.ts

export type SectionName = 'Favorites' | 'General_Processes' | 'Operations' | 'Financial';

export interface Tab {
  key: string;
  text: string;
  disabled?: boolean;
}

export interface FormItem {
  title: string;
  url: string;
  icon: string;
  tags?: string[]; // Existing tags property
  description?: string;
  embedScript?: {
    key: string;
    formId: string;
  };
  fields?: Array<{
    label: string;
    type: 'text' | 'number' | 'textarea' | 'dropdown' | 'toggle' | 'currency-picker' | 'file'; // Added 'file'
    options?: string[]; // For dropdowns
    step?: number; // For number inputs
    editable?: boolean; // For currency-picker or number inputs
    required?: boolean;
    defaultValue?: boolean | string | number | File; // Included File type
    prefix?: string; // Add prefix for currency or similar
    helpText?: string; // Add help text for tooltips or field explanations
    placeholder?: string; // Optional: For additional placeholders
  }>; // Add fields for forms
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
  holiday_entitlement?: number; // Add this field
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

// Define the structure for Matter
export interface Matter {
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
  "status"?: string; // <-- Added field for team status (e.g. 'active')
}
