export interface DealRecord {
  DealId?: number;
  ProspectId?: number;
  InstructionRef?: string;
  ServiceDescription?: string;
  Amount?: number;
  AreaOfWork?: string;
  PitchedBy?: string;
  PitchedDate?: string;
  Status?: string;
  Stage?: string;
  CreatedDate?: string;
  ModifiedDate?: string;
  CloseDate?: string;
  [key: string]: unknown;
}

export interface InstructionRecord {
  InstructionRef?: string;
  ProspectId?: number;
  Email?: string;
  Stage?: string;
  Status?: string;
  CreatedDate?: string;
  SubmissionDate?: string;
  MatterId?: string;
  ClientId?: string;
  workflow?: string;
  payments?: unknown;
  [key: string]: unknown;
}
