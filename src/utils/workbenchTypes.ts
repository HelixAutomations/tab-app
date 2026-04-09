export type WorkbenchStageStatus = 'pending' | 'processing' | 'warning' | 'review' | 'complete' | 'neutral';

export type WorkbenchJourneyStatus = WorkbenchStageStatus | 'current' | 'disabled';

export type WorkbenchTab = 'details' | 'identity' | 'payment' | 'risk' | 'matter' | 'documents' | 'pitch';

export type WorkbenchContextStage = 'enquiry' | 'instructed';

export type WorkbenchStageKey = 'id' | 'payment' | 'risk' | 'matter' | 'documents';

export type WorkbenchItemRecord = Record<string, any>;

export type WorkbenchStageStatuses = Partial<Record<WorkbenchStageKey, WorkbenchStageStatus>>;

export interface WorkbenchItem {
  instruction?: WorkbenchItemRecord | null;
  deal?: WorkbenchItemRecord | null;
  matter?: WorkbenchItemRecord | null;
  clients?: WorkbenchItemRecord[];
  documents?: WorkbenchItemRecord[];
  payments?: WorkbenchItemRecord[];
  eid?: WorkbenchItemRecord | null;
  eids?: WorkbenchItemRecord[];
  risk?: WorkbenchItemRecord | null;
  matters?: WorkbenchItemRecord[];
  enquiry?: WorkbenchItemRecord | null;
  Enquiry?: WorkbenchItemRecord | null;
  enquiryRecord?: WorkbenchItemRecord | null;
  prospectEnquiry?: WorkbenchItemRecord | null;
  pitch?: WorkbenchItemRecord | null;
  Pitch?: WorkbenchItemRecord | null;
  pitchData?: WorkbenchItemRecord | null;
  stageStatuses?: WorkbenchStageStatuses;
  prospectId?: string | number | null;
  ProspectId?: string | number | null;
  [key: string]: any;
}

export const workbenchTabForStageKey = (stageKey: string): WorkbenchTab => {
  switch (stageKey) {
    case 'id':
      return 'identity';
    case 'payment':
      return 'payment';
    case 'risk':
      return 'risk';
    case 'matter':
      return 'matter';
    case 'documents':
      return 'documents';
    case 'pitch':
      return 'pitch';
    default:
      return 'details';
  }
};

export const workbenchContextStageForStageKey = (stageKey: string): WorkbenchContextStage => (
  stageKey === 'enquiry' ? 'enquiry' : 'instructed'
);

export const isWorkbenchContextStageKey = (stageKey: string): boolean => (
  stageKey === 'enquiry' || stageKey === 'instructed'
);