export const PORTAL_BASE_URL = 'https://instruct.helix-law.com/pitch';

export type PortalDestinationKind = 'pitch' | 'workspace' | 'holding' | 'matter-portal';

export interface PortalLaunchInput {
  passcode?: string | null;
  workspacePasscode?: string | null;
  workspaceReady?: boolean;
  instructionRef?: string | null;
  matterRef?: string | null;
  hasInstruction?: boolean;
  hasMatter?: boolean;
  absoluteUrl?: string | null;
  entryLabel?: string | null;
}

export interface PortalLaunchModel {
  isAvailable: boolean;
  kind: PortalDestinationKind | null;
  title: string;
  statusLabel: string;
  summary: string;
  detail: string;
  nextAction: string;
  goLabel: string;
  url: string;
  passcode: string;
  instructionRef: string;
  matterRef: string;
  entryLabel: string;
  resolverHint: string;
}

const clean = (value?: string | null): string => String(value || '').trim();

export const buildPortalUrl = (passcode?: string | null): string => {
  const cleaned = clean(passcode);
  return cleaned ? `${PORTAL_BASE_URL}/${cleaned}` : '';
};

export const buildPortalLaunchModel = (input: PortalLaunchInput): PortalLaunchModel => {
  const passcode = clean(input.passcode);
  const workspacePasscode = clean(input.workspacePasscode);
  const instructionRef = clean(input.instructionRef);
  const matterRef = clean(input.matterRef);
  const absoluteUrl = clean(input.absoluteUrl);
  const entryLabel = clean(input.entryLabel) || 'Client space';
  const hasInstruction = Boolean(input.hasInstruction || instructionRef);
  const hasMatter = Boolean(input.hasMatter || matterRef);
  const workspaceReady = Boolean(input.workspaceReady && workspacePasscode);

  if (absoluteUrl) {
    return {
      isAvailable: true,
      kind: hasMatter ? 'matter-portal' : hasInstruction ? 'holding' : 'pitch',
      title: hasMatter ? 'Matter Portal' : hasInstruction ? 'Instruction Received' : 'Instruct Helix Law',
      statusLabel: hasMatter ? 'Ready' : hasInstruction ? 'Received' : 'Ready',
      summary: hasMatter
        ? 'View matters, documents and progress.'
        : hasInstruction
          ? 'The instruction has been received and is being processed.'
          : 'Review and complete the instruction securely.',
      detail: '',
      nextAction: hasMatter
        ? 'Use Hub for operations and the client view for the live portal.'
        : hasInstruction
          ? 'Continue progressing ID, payment, risk and matter opening in Hub.'
          : 'Send or review the secure instruction link.',
      goLabel: hasMatter ? 'Go to Matter Portal' : hasInstruction ? 'Go to Instruction' : 'Go to Instruct Helix Law',
      url: absoluteUrl,
      passcode: passcode || workspacePasscode,
      instructionRef,
      matterRef,
      entryLabel,
      resolverHint: 'This launch goes straight to the current client destination.',
    };
  }

  if (hasMatter && passcode) {
    return {
      isAvailable: true,
      kind: 'matter-portal',
      title: 'Matter Portal',
      statusLabel: 'Ready',
      summary: 'View matters, documents and progress.',
      detail: '',
      nextAction: 'Use Hub for operations; use the portal for the client-facing view.',
      goLabel: 'Go to Matter Portal',
      url: buildPortalUrl(passcode),
      passcode,
      instructionRef,
      matterRef,
      entryLabel,
      resolverHint: 'The same passcode route is used, but the client now resolves into the portal state.',
    };
  }

  if (workspaceReady && workspacePasscode) {
    return {
      isAvailable: true,
      kind: 'workspace',
      title: 'Secure Document Workspace',
      statusLabel: 'Ready',
      summary: 'Share documents securely with your solicitor.',
      detail: '',
      nextAction: 'Track uploads in Hub and progress the client towards instruction or matter opening.',
      goLabel: 'Go to Workspace',
      url: buildPortalUrl(workspacePasscode),
      passcode: workspacePasscode,
      instructionRef,
      matterRef,
      entryLabel,
      resolverHint: 'The workspace uses the same passcode resolver pattern as checkout and portal flows.',
    };
  }

  if (hasInstruction && passcode) {
    return {
      isAvailable: true,
      kind: 'holding',
      title: 'Instruction Received',
      statusLabel: 'Received',
      summary: 'The instruction has been received and is being processed.',
      detail: '',
      nextAction: 'Complete ID, payment, risk, and matter opening to graduate this into the live portal.',
      goLabel: 'Go to Instruction',
      url: buildPortalUrl(passcode),
      passcode,
      instructionRef,
      matterRef,
      entryLabel,
      resolverHint: 'Hub uses the passcode route, and the remote app decides the exact instructed-state screen.',
    };
  }

  if (passcode) {
    return {
      isAvailable: true,
      kind: 'pitch',
      title: 'Instruct Helix Law',
      statusLabel: 'Ready',
      summary: 'Review and complete the instruction securely.',
      detail: '',
      nextAction: 'Use this when the prospect is still being converted into an instruction.',
      goLabel: 'Go to Instruct Helix Law',
      url: buildPortalUrl(passcode),
      passcode,
      instructionRef,
      matterRef,
      entryLabel,
      resolverHint: 'The passcode route is a resolver: the remote app decides the exact checkout surface.',
    };
  }

  return {
    isAvailable: false,
    kind: null,
    title: 'No client space yet',
    statusLabel: 'Not ready',
    summary: 'No client-facing passcode space is available yet.',
    detail: 'Create the pitch or workspace first to produce a client launch destination.',
    nextAction: 'Generate a pitch or request-docs workspace from Hub.',
    goLabel: 'Go to client view',
    url: '',
    passcode: '',
    instructionRef,
    matterRef,
    entryLabel,
    resolverHint: 'Once a passcode exists, Hub can launch the client-facing space directly.',
  };
};