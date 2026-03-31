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

export interface TranscriptSentence {
  sentence_index: number;
  speaker: string | null;
  content: string;
  sentiment: number | null;
}

export interface DubberCallRecord {
  recording_id: string;
  from_party: string | null;
  from_label: string | null;
  to_party: string | null;
  to_label: string | null;
  call_type: string | null;
  recording_type: string | null;
  duration_seconds: number | null;
  start_time_utc: string;
  document_sentiment_score: number | null;
  ai_document_sentiment: string | null;
  channel: string | null;
  status: string | null;
  matched_team_initials: string | null;
  matched_team_email: string | null;
  match_strategy: string | null;
  document_emotion_json: string | null;
  is_internal: boolean;
  resolved_name: string | null;
  enquiry_ref: string | null;
  area_of_work: string | null;
  summary_text: string | null;
  transcript: TranscriptSentence[];
}
