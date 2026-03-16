import { getPracticeAreaOptions, resolveMatterPracticeArea } from './config';

export type MatterOpeningClientType = 'Individual' | 'Company' | 'Multiple Individuals' | 'Existing Client';
export type IntakeEntryPoint = 'compact' | 'flat' | 'external';
export type ParticipantRole = 'primary_client' | 'joint_client' | 'company' | 'company_contact' | 'existing_client';
export type ParticipantResolution = 'resolved' | 'partial';

export interface MatterOpeningClientRecord {
  poid_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  best_number?: string | null;
  type?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  address?: Record<string, unknown> | null;
  company_details?: {
    name?: string | null;
    number?: string | null;
    relationship?: string | null;
    address?: Record<string, unknown> | null;
  } | null;
  verification?: {
    stage?: string | null;
    check_result?: string | null;
    pep_sanctions_result?: string | null;
    address_verification_result?: string | null;
    check_expiry?: string | null;
    check_id?: string | null;
  } | null;
  display_name?: string | null;
  client_role?: ParticipantRole | null;
  participant_source?: IntakeEntryPoint | 'poid' | 'instruction' | 'manual' | null;
  is_primary?: boolean | null;
}

export interface CanonicalParticipant {
  participantId: string;
  poidId: string | null;
  displayName: string;
  entityType: 'individual' | 'company';
  role: ParticipantRole;
  isPrimary: boolean;
  source: string;
  resolution: ParticipantResolution;
  email: string | null;
  phone: string | null;
  hasVerification: boolean;
  verificationState: string | null;
  relationship: string | null;
}

export interface MatterOpeningValidationResult {
  isValid: boolean;
  suggestions: string[];
  warnings: string[];
  predictions: Array<{ step: string; willPass: boolean; reason: string }>;
  canonicalParticipants: CanonicalParticipant[];
}

export interface MatterOpeningPayload {
  matter_details: Record<string, any>;
  team_assignments: Record<string, any>;
  client_information: MatterOpeningClientRecord[];
  source_details: Record<string, any>;
  opponent_details: Record<string, any> | null;
  compliance: Record<string, any>;
  metadata: Record<string, any>;
  instruction_summary: Record<string, any> | null;
}

const ALLOWED_CLIENT_TYPES: MatterOpeningClientType[] = ['Individual', 'Company', 'Multiple Individuals', 'Existing Client'];

const text = (value: unknown): string => String(value ?? '').trim();
const nullableText = (value: unknown): string | null => {
  const cleaned = text(value);
  return cleaned || null;
};

const normaliseClientType = (value: unknown): MatterOpeningClientType | '' => {
  const candidate = text(value);
  return ALLOWED_CLIENT_TYPES.includes(candidate as MatterOpeningClientType)
    ? (candidate as MatterOpeningClientType)
    : '';
};

const buildDisplayName = (client: MatterOpeningClientRecord): string => {
  const name = [text(client.first_name), text(client.last_name)].filter(Boolean).join(' ').trim();
  if (name) return name;
  const companyName = text(client.company_details?.name);
  if (companyName) return companyName;
  const displayName = text(client.display_name);
  if (displayName) return displayName;
  const email = text(client.email);
  if (email) return email;
  const poidId = text(client.poid_id);
  return poidId ? `POID ${poidId}` : 'Unresolved participant';
};

const deriveEntityType = (client: MatterOpeningClientRecord): 'individual' | 'company' => {
  if (text(client.type).toLowerCase() === 'company') return 'company';
  if (text(client.company_details?.name) || text(client.company_details?.number)) return 'company';
  return 'individual';
};

const dedupeClients = (clients: MatterOpeningClientRecord[]): MatterOpeningClientRecord[] => {
  const seen = new Set<string>();
  return clients.filter((client) => {
    const key = [text(client.poid_id), buildDisplayName(client).toLowerCase(), text(client.company_details?.number).toLowerCase()]
      .filter(Boolean)
      .join('|');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildCanonicalParticipants = (
  clientType: unknown,
  clients: MatterOpeningClientRecord[],
): CanonicalParticipant[] => {
  const normalizedType = normaliseClientType(clientType);
  const deduped = dedupeClients(clients);

  return deduped.map((client, index) => {
    const entityType = deriveEntityType(client);
    const hasVerifiedIdentity = Boolean(text(client.verification?.check_result));
    const source = text(client.participant_source) || (text(client.poid_id) ? 'poid' : 'manual');
    const displayName = buildDisplayName(client);
    const resolution: ParticipantResolution = text(client.poid_id) || displayName !== 'Unresolved participant' ? 'resolved' : 'partial';

    let role: ParticipantRole;
    if (client.client_role) {
      role = client.client_role;
    } else if (normalizedType === 'Company' && entityType === 'company') {
      role = 'company';
    } else if (normalizedType === 'Company') {
      role = index === 0 ? 'company_contact' : 'joint_client';
    } else if (normalizedType === 'Multiple Individuals') {
      role = index === 0 ? 'primary_client' : 'joint_client';
    } else if (normalizedType === 'Existing Client') {
      role = index === 0 ? 'existing_client' : 'joint_client';
    } else {
      role = index === 0 ? 'primary_client' : 'joint_client';
    }

    return {
      participantId: text(client.poid_id) || `${entityType}-${index + 1}`,
      poidId: nullableText(client.poid_id),
      displayName,
      entityType,
      role,
      isPrimary: Boolean(client.is_primary ?? index === 0),
      source,
      resolution,
      email: nullableText(client.email),
      phone: nullableText(client.best_number),
      hasVerification: hasVerifiedIdentity,
      verificationState: nullableText(client.verification?.check_result),
      relationship: nullableText(client.company_details?.relationship),
    };
  });
};

export const buildMatterOpeningPayload = (args: {
  entryPoint: IntakeEntryPoint;
  matterDetails: Record<string, unknown>;
  teamAssignments: Record<string, unknown>;
  clientInformation: MatterOpeningClientRecord[];
  sourceDetails: Record<string, unknown>;
  opponentDetails?: Record<string, unknown> | null;
  compliance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  instructionSummary?: Record<string, unknown> | null;
}): MatterOpeningPayload => {
  const matterDetails = args.matterDetails || {};
  const normalizedType = normaliseClientType(matterDetails.client_type);
  const normalizedPracticeArea = resolveMatterPracticeArea(
    text(matterDetails.area_of_work),
    text(matterDetails.practice_area),
  );
  const normalizedClients = dedupeClients(args.clientInformation || []).map((client, index) => ({
    ...client,
    poid_id: nullableText(client.poid_id),
    first_name: nullableText(client.first_name),
    last_name: nullableText(client.last_name),
    email: nullableText(client.email),
    best_number: nullableText(client.best_number),
    display_name: nullableText(client.display_name) || buildDisplayName(client),
    type: nullableText(client.type) || (deriveEntityType(client) === 'company' ? 'company' : 'individual'),
    client_role: client.client_role || undefined,
    participant_source: client.participant_source || args.entryPoint,
    is_primary: client.is_primary ?? index === 0,
  }));
  const canonicalParticipants = buildCanonicalParticipants(normalizedType || matterDetails.client_type, normalizedClients);

  return {
    matter_details: {
      ...matterDetails,
      client_type: normalizedType || text(matterDetails.client_type),
      area_of_work: text(matterDetails.area_of_work),
      practice_area: normalizedPracticeArea,
      description: text(matterDetails.description),
    },
    team_assignments: args.teamAssignments || {},
    client_information: normalizedClients,
    source_details: {
      ...args.sourceDetails,
      source: text(args.sourceDetails?.source) || 'uncertain',
      referrer_name: nullableText(args.sourceDetails?.referrer_name),
    },
    opponent_details: args.opponentDetails || null,
    compliance: args.compliance || {},
    metadata: {
      ...(args.metadata || {}),
      intake_model_version: '2026-03-15',
      intake_entry_point: args.entryPoint,
      participant_count: canonicalParticipants.length,
      unresolved_participant_count: canonicalParticipants.filter((participant) => participant.resolution !== 'resolved').length,
      participants_summary: canonicalParticipants,
    },
      instruction_summary: args.instructionSummary || null,
  };
};

export const validateMatterOpeningPayload = (payload: any): MatterOpeningValidationResult => {
  const suggestions: string[] = [];
  const warnings: string[] = [];
  const predictions: Array<{ step: string; willPass: boolean; reason: string }> = [];
  const expectedSections = ['matter_details', 'team_assignments', 'client_information', 'source_details'];
  const missingSections = expectedSections.filter((section) => !payload?.[section]);
  if (missingSections.length > 0) {
    suggestions.push(`Missing required sections: ${missingSections.join(', ')}`);
  }

  const matterDetails = payload?.matter_details || {};
  const normalizedType = normaliseClientType(matterDetails.client_type);
  const areaOfWork = text(matterDetails.area_of_work);
  const practiceArea = text(matterDetails.practice_area);
  const allowedPracticeAreas = getPracticeAreaOptions(areaOfWork);

  if (!normalizedType) suggestions.push('client_type is required in matter_details');
  if (!areaOfWork) suggestions.push('area_of_work is required in matter_details');
  if (!practiceArea) {
    suggestions.push('practice_area is required in matter_details');
  } else if (allowedPracticeAreas.length > 0 && !allowedPracticeAreas.includes(practiceArea)) {
    suggestions.push(`practice_area is not valid for ${areaOfWork}`);
  }
  if (text(matterDetails.description).length < 10) {
    suggestions.push('description should be at least 10 characters long');
  }

  predictions.push({
    step: 'Client Type Selection',
    willPass: Boolean(normalizedType),
    reason: normalizedType ? 'Valid client type provided' : 'Client type missing or invalid',
  });
  predictions.push({
    step: 'Area of Work',
    willPass: Boolean(areaOfWork),
    reason: areaOfWork ? 'Area of work specified' : 'Area of work missing',
  });
  predictions.push({
    step: 'Practice Area',
    willPass: Boolean(practiceArea) && (!allowedPracticeAreas.length || allowedPracticeAreas.includes(practiceArea)),
    reason: !practiceArea ? 'Practice area missing' : (!allowedPracticeAreas.length || allowedPracticeAreas.includes(practiceArea) ? 'Practice area valid' : 'Practice area invalid for selected area'),
  });

  const teamAssignments = payload?.team_assignments || {};
  if (!text(teamAssignments.fee_earner)) suggestions.push('fee_earner is required in team_assignments');
  if (!text(teamAssignments.supervising_partner)) warnings.push('supervising_partner recommended but not required');
  predictions.push({
    step: 'Team Assignment',
    willPass: Boolean(text(teamAssignments.fee_earner)),
    reason: text(teamAssignments.fee_earner) ? 'Fee earner assigned' : 'Fee earner required but missing',
  });

  const clientInformation = Array.isArray(payload?.client_information) ? payload.client_information : [];
  const canonicalParticipants = buildCanonicalParticipants(normalizedType || matterDetails.client_type, clientInformation);
  if (canonicalParticipants.length === 0) {
    suggestions.push('At least one client must be selected or provided');
  }
  canonicalParticipants.forEach((participant, index) => {
    if (participant.resolution !== 'resolved' && !participant.poidId) {
      suggestions.push(`Client ${index + 1}: participant is missing an identifier or usable name`);
    }
    if (!participant.email) {
      warnings.push(`Client ${index + 1}: email is recommended`);
    }
    if (!participant.hasVerification) {
      warnings.push(`Client ${index + 1}: no verification data found`);
    } else if (participant.verificationState && participant.verificationState.toLowerCase() !== 'passed') {
      warnings.push(`Client ${index + 1}: ID verification not passed (${participant.verificationState})`);
    }
  });

  const companyParticipants = canonicalParticipants.filter((participant) => participant.entityType === 'company');
  const individualParticipants = canonicalParticipants.filter((participant) => participant.entityType === 'individual');
  if (normalizedType === 'Company' && companyParticipants.length === 0) {
    suggestions.push('Company client type requires a company record or company details');
  }
  if (normalizedType === 'Multiple Individuals' && individualParticipants.length < 2) {
    warnings.push('Multiple Individuals selected but fewer than 2 resolved individuals are present');
  }
  predictions.push({
    step: 'Client Selection',
    willPass: canonicalParticipants.length > 0 && !canonicalParticipants.some((participant) => participant.resolution !== 'resolved' && !participant.poidId),
    reason: canonicalParticipants.length === 0
      ? 'No clients selected'
      : canonicalParticipants.some((participant) => participant.resolution !== 'resolved' && !participant.poidId)
        ? 'Some participants still need resolution'
        : 'Client intake is usable',
  });

  const sourceDetails = payload?.source_details || {};
  const source = text(sourceDetails.source);
  if (!source) suggestions.push('source is required in source_details');
  if (source === 'referral' && !text(sourceDetails.referrer_name)) {
    suggestions.push('referrer_name is required when source is "referral"');
  }
  predictions.push({
    step: 'Source Information',
    willPass: Boolean(source) && (source !== 'referral' || Boolean(text(sourceDetails.referrer_name))),
    reason: !source
      ? 'Source missing'
      : source === 'referral' && !text(sourceDetails.referrer_name)
        ? 'Referrer name required for referral source'
        : 'Source information valid',
  });

  const opponentDetails = payload?.opponent_details;
  const opponent = opponentDetails?.opponent || opponentDetails?.individual || null;
  const solicitor = opponentDetails?.solicitor || null;
  const hasOpponentInfo = Boolean(
    text(opponent?.first_name) ||
    text(opponent?.last_name) ||
    text(opponent?.company_name) ||
    text(opponent?.email)
  );
  const hasSolicitorInfo = Boolean(
    text(solicitor?.first_name) ||
    text(solicitor?.last_name) ||
    text(solicitor?.company_name)
  );
  if (hasOpponentInfo && !text(opponent?.company_name) && !(text(opponent?.first_name) && text(opponent?.last_name))) {
    warnings.push('Opponent details are partial and may need completion');
  }
  if (hasSolicitorInfo && !text(solicitor?.company_name)) {
    warnings.push('Opponent solicitor missing company name');
  }
  predictions.push({
    step: 'Opponent Details',
    willPass: true,
    reason: hasOpponentInfo || hasSolicitorInfo ? 'Opponent information provided' : 'No opponent information (optional)',
  });

  return {
    isValid: suggestions.length === 0,
    suggestions,
    warnings,
    predictions,
    canonicalParticipants,
  };
};