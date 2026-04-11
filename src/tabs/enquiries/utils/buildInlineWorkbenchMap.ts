import type { WorkbenchItem } from '../../../utils/workbenchTypes';

/**
 * Merge prop-supplied instructionData with local overrides.
 * Pure function — no React hooks.
 */
export function mergeInstructionOverrides(
  instructionData: any[] | null | undefined,
  overrides: Map<string, any>,
): any[] | null | undefined {
  if (!instructionData || overrides.size === 0) return instructionData;
  return (instructionData as any[]).map((prospect: any) => {
    const instructions = Array.isArray(prospect?.instructions) ? prospect.instructions : [];
    const hasOverride = instructions.some((inst: any) =>
      overrides.has(inst?.InstructionRef || inst?.instructionRef || '')
    );
    if (!hasOverride) return prospect;
    return {
      ...prospect,
      instructions: instructions.map((inst: any) => {
        const ref = inst?.InstructionRef || inst?.instructionRef || '';
        const override = overrides.get(ref);
        return override ? { ...inst, ...override } : inst;
      }),
      // Also merge idVerifications from override if present
      idVerifications: (() => {
        const overriddenInst = instructions.find((inst: any) =>
          overrides.has(inst?.InstructionRef || inst?.instructionRef || '')
        );
        if (!overriddenInst) return prospect?.idVerifications;
        const ref = overriddenInst?.InstructionRef || overriddenInst?.instructionRef || '';
        const override = overrides.get(ref);
        return override?.idVerifications ?? prospect?.idVerifications;
      })(),
      // Merge risk assessments from override when inline save occurs
      riskAssessments: (() => {
        const overriddenInst = instructions.find((inst: any) =>
          overrides.has(inst?.InstructionRef || inst?.instructionRef || '')
        );
        if (!overriddenInst) return prospect?.riskAssessments;
        const ref = overriddenInst?.InstructionRef || overriddenInst?.instructionRef || '';
        const override = overrides.get(ref);
        return override?.riskAssessments ?? prospect?.riskAssessments;
      })(),
    };
  });
}

// ─── Scoring ───────────────────────────────────────────────────────────

function scoreWorkbenchItem(workbenchItem: WorkbenchItem): number {
  const inst = workbenchItem?.instruction;
  const matters = workbenchItem?.matters;
  const deal = workbenchItem?.deal;
  const hasInstructionRef = Boolean(inst?.InstructionRef || inst?.instructionRef);
  const hasMatter = Boolean(inst?.MatterId || inst?.matterId) || (Array.isArray(matters) && matters.length > 0);
  const hasDeal = Boolean(deal);
  let score = (hasMatter ? 4 : 0) + (hasInstructionRef ? 1 : 0) + (hasDeal ? 1 : 0);

  // Prefer active/instructed deals over expired ones
  const dealStatus = String(deal?.Status || deal?.status || '').toLowerCase();
  if (dealStatus === 'instructed') score += 3;
  else if (dealStatus === 'pitched' || dealStatus === 'accepted') score += 2;
  else if (dealStatus === 'expired' || dealStatus === 'declined') score += 0;

  // Prefer advanced pipeline stages (proof-of-id-complete > initialised)
  const stage = String(inst?.Stage || '').toLowerCase();
  if (stage.includes('matter') || stage.includes('complete')) score += 3;
  else if (stage.includes('proof') || stage.includes('risk') || stage.includes('payment')) score += 2;
  else if (stage === 'initialised' || stage === 'initialized') score += 0;
  else if (stage) score += 1;

  // Prefer instructions with personal identity data populated
  if (inst?.DOB || inst?.DateOfBirth || inst?.PassportNumber || inst?.DriversLicenseNumber) score += 2;
  if (inst?.HouseNumber || inst?.Street || inst?.Postcode) score += 1;

  return score;
}

// ─── Main builder ──────────────────────────────────────────────────────

/**
 * Build a Map<enquiryId, WorkbenchItem> from enriched instruction data.
 * Pure function — call inside useMemo.
 */
export function buildInlineWorkbenchMap(
  effectiveInstructionData: any[] | null | undefined,
  demoModeEnabled: boolean,
  userData: any[] | null | undefined,
): Map<string, WorkbenchItem> {
  const result = new Map<string, WorkbenchItem>();
  if (!effectiveInstructionData) return result;

  const normaliseId = (value: unknown): string | null => {
    const s = String(value ?? '').trim();
    return s.length > 0 ? s : null;
  };

  // Global indexes (Deals are the join point: Deal.InstructionRef -> Instructions.InstructionRef)
  const instructionByRef = new Map<string, any>();
  const dealByRef = new Map<string, any>();
  const dealsByProspectId = new Map<string, any[]>();

  (effectiveInstructionData as any[]).forEach((prospect) => {
    const instructions: any[] = Array.isArray(prospect?.instructions) ? prospect.instructions : [];
    const deals: any[] = Array.isArray(prospect?.deals) ? prospect.deals : [];

    instructions.forEach((inst) => {
      const ref = normaliseId(inst?.InstructionRef ?? inst?.instructionRef);
      if (ref && !instructionByRef.has(ref)) {
        instructionByRef.set(ref, inst);
      }
    });

    deals.forEach((deal) => {
      const ref = normaliseId(deal?.InstructionRef ?? deal?.instructionRef);
      if (ref && !dealByRef.has(ref)) {
        dealByRef.set(ref, deal);
      }
      const pid = normaliseId(deal?.ProspectId ?? deal?.prospectId);
      if (pid) {
        const arr = dealsByProspectId.get(pid) || [];
        arr.push(deal);
        dealsByProspectId.set(pid, arr);
      }
    });
  });

  (effectiveInstructionData as any[]).forEach((prospect) => {
    const instructions: any[] = Array.isArray(prospect?.instructions) ? prospect.instructions : [];
    const deals: any[] = Array.isArray(prospect?.deals) ? prospect.deals : [];

    const riskAssessments: any[] = Array.isArray(prospect?.riskAssessments)
      ? prospect.riskAssessments
      : (Array.isArray(prospect?.compliance) ? prospect.compliance : []);

    const idVerifications: any[] = Array.isArray(prospect?.idVerifications)
      ? prospect.idVerifications
      : (Array.isArray(prospect?.electronicIDChecks) ? prospect.electronicIDChecks : []);

    const registerForEnquiryId = (enquiryId: string, inst: any | null, dealOverride?: any | null) => {
      if (!enquiryId) return;

      const localDealByProspect = deals.find((d) => normaliseId(d?.ProspectId ?? d?.prospectId) === enquiryId) || null;
      const globalDealsByProspect = dealsByProspectId.get(enquiryId) || [];

      const matchingDeal =
        dealOverride ||
        localDealByProspect ||
        globalDealsByProspect[0] ||
        deals[0] ||
        null;

      const matchingDealRef = normaliseId(matchingDeal?.InstructionRef ?? matchingDeal?.instructionRef);
      const matchingInstructionRef = normaliseId(inst?.InstructionRef ?? inst?.instructionRef);

      const matchingInstruction =
        inst ||
        (matchingDealRef ? (instructionByRef.get(matchingDealRef) || null) : null) ||
        (matchingInstructionRef ? (instructionByRef.get(matchingInstructionRef) || null) : null) ||
        instructions[0] ||
        null;

      // If we found an instruction but not a deal yet, try the join path by InstructionRef
      const instructionRef = normaliseId(matchingInstruction?.InstructionRef ?? matchingInstruction?.instructionRef);
      const joinedDeal = !matchingDeal && instructionRef ? (dealByRef.get(instructionRef) || null) : null;
      const finalDeal = matchingDeal || joinedDeal;

      if (!matchingInstruction && !finalDeal) return;

      const workbenchItem: WorkbenchItem = {
        instruction: matchingInstruction,
        deal: finalDeal,
        clients: prospect?.jointClients || finalDeal?.jointClients || prospect?.clients || [],
        documents: prospect?.documents || matchingInstruction?.documents || [],
        payments: prospect?.payments || matchingInstruction?.payments || [],
        eid: idVerifications[0] ?? null,
        eids: idVerifications,
        risk: riskAssessments[0] ?? null,
        matters: prospect?.matters || matchingInstruction?.matters || [],
        prospectId: enquiryId,
        ProspectId: enquiryId,
      };

      const existing = result.get(enquiryId);
      if (!existing || scoreWorkbenchItem(workbenchItem) > scoreWorkbenchItem(existing)) {
        result.set(enquiryId, workbenchItem);
      }
    };

    // Helper to extract ProspectId from InstructionRef pattern (HLX-{ProspectId}-{Passcode})
    const extractProspectIdFromRef = (ref: unknown): string | null => {
      if (typeof ref !== 'string') return null;
      const match = ref.match(/^HLX-(\d+)-\d+$/);
      return match ? match[1] : null;
    };

    // Preferred linkage: per-instruction ProspectId/prospectId
    instructions.forEach((inst) => {
      const enquiryId = normaliseId(inst?.ProspectId ?? inst?.prospectId) 
        || extractProspectIdFromRef(inst?.InstructionRef ?? inst?.instructionRef);
      if (!enquiryId) return;
      registerForEnquiryId(enquiryId, inst);
    });

    // Also allow deal-only linkage (pitches)
    deals.forEach((deal) => {
      const enquiryId = normaliseId(deal?.ProspectId ?? deal?.prospectId)
        || extractProspectIdFromRef(deal?.InstructionRef ?? deal?.instructionRef);
      if (!enquiryId) return;
      const matchingInst = (deal?.InstructionRef ? (instructionByRef.get(String(deal.InstructionRef)) || null) : null) || null;
      registerForEnquiryId(enquiryId, matchingInst, deal);
    });

    // Fallback linkage: some datasets carry enquiry ID on the prospect wrapper itself
    const wrapperId = normaliseId(prospect?.prospectId) 
      || extractProspectIdFromRef(prospect?.prospectId);
    if (wrapperId && (instructions.length > 0 || deals.length > 0)) {
      registerForEnquiryId(wrapperId, instructions[0] ?? null, deals[0] ?? null);
    }

    // Email-based linkage for v2 enquiries (primary creation, not just copy).
    // Enrichment matches pitches by email reliably; workbench must too.
    // Instruction.Email → workbench item, keyed as "email:<normalised>".
    instructions.forEach((inst) => {
      const instEmail = String(inst?.Email ?? inst?.email ?? '').trim().toLowerCase();
      if (!instEmail) return;
      const emailKey = `email:${instEmail}`;
      if (result.has(emailKey)) return; // don't overwrite a better match
      // Prefer re-using the ProspectId-based entry if it succeeded
      const enquiryId = normaliseId(inst?.ProspectId ?? inst?.prospectId)
        || extractProspectIdFromRef(inst?.InstructionRef ?? inst?.instructionRef);
      const existing = enquiryId ? result.get(enquiryId) : undefined;
      if (existing) {
        result.set(emailKey, existing);
      } else {
        // ProspectId match failed — create a primary entry from scratch
        registerForEnquiryId(emailKey, inst);
      }
    });

    // Deal-email fallback: Deals.LeadClientEmail may differ from Instruction.Email
    deals.forEach((deal) => {
      const dealEmail = String(deal?.LeadClientEmail ?? deal?.leadClientEmail ?? deal?.Email ?? deal?.email ?? '').trim().toLowerCase();
      if (!dealEmail) return;
      const emailKey = `email:${dealEmail}`;
      if (result.has(emailKey)) return;
      const dealRef = normaliseId(deal?.InstructionRef ?? deal?.instructionRef);
      const matchingInst = dealRef ? (instructionByRef.get(dealRef) || null) : null;
      registerForEnquiryId(emailKey, matchingInst, deal);
    });
  });

  if (demoModeEnabled) {
    const currentUserEmail = userData && userData[0] && userData[0].Email
      ? userData[0].Email
      : 'lz@helix-law.com';
    const demoCases = [
      {
        id: 'DEMO-ENQ-0001',
        instructionRef: 'HLX-DEMO-00001',
        serviceDescription: 'Contract Dispute',
        amount: 1500,
        stage: 'enquiry',
        eidStatus: 'pending',
        eidResult: 'pending',
        internalStatus: 'pending',
        riskResult: null as string | null,
        hasMatter: false,
        hasPayment: false,
        documents: 0,
      },
      {
        id: 'DEMO-ENQ-0002',
        instructionRef: 'HLX-DEMO-0002-00001',
        serviceDescription: 'Lease Renewal',
        amount: 3200,
        stage: 'proof-of-id',
        eidStatus: 'complete',
        eidResult: 'Refer',
        pepResult: 'Review',
        addressResult: 'Passed',
        internalStatus: 'pending',
        riskResult: null as string | null,
        hasMatter: false,
        hasPayment: false,
        documents: 1,
      },
      {
        id: 'DEMO-ENQ-0003',
        instructionRef: 'HLX-DEMO-0003-00001',
        serviceDescription: 'Employment Tribunal',
        amount: 5000,
        stage: 'matter-opened',
        eidStatus: 'complete',
        eidResult: 'Pass',
        internalStatus: 'paid',
        riskResult: null as string | null,
        hasMatter: true,
        hasPayment: true,
        documents: 3,
      },
    ];

    demoCases.forEach((demoCase) => {
      const isIndividualClientDemo = demoCase.id === 'DEMO-ENQ-0002';
      const demoInstructionDate = new Date();
      demoInstructionDate.setDate(demoInstructionDate.getDate() - 3);
      const demoEidDate = new Date();
      demoEidDate.setDate(demoEidDate.getDate() - 2);
      
      const instruction = demoCase.instructionRef ? {
        InstructionRef: demoCase.instructionRef,
        ProspectId: demoCase.id,
        Stage: demoCase.stage,
        SubmissionDate: demoInstructionDate.toISOString(),
        SubmissionTime: demoInstructionDate.toISOString(),
        EIDStatus: demoCase.eidStatus,
        EIDOverallResult: demoCase.eidResult,
        InternalStatus: demoCase.internalStatus,
        MatterId: demoCase.hasMatter ? 'MAT-DEMO-001' : undefined,
        Forename: 'Demo',
        Surname: 'Client',
        FirstName: 'Demo',
        LastName: 'Client',
        Title: 'Mr',
        Gender: 'Male',
        Email: 'demo.client@helix-law.com',
        Phone: '07700 900123',
        CompanyName: isIndividualClientDemo ? '' : 'Demo Corp',
        CompanyNumber: isIndividualClientDemo ? '' : '12345678',
        ClientType: isIndividualClientDemo ? 'Individual' : 'Company',
        AreaOfWork: demoCase.serviceDescription,
        ServiceDescription: demoCase.serviceDescription,
        FeeEarner: demoCase.id === 'DEMO-ENQ-0002' ? 'CB' : 'LZ',
        HelixContact: demoCase.id === 'DEMO-ENQ-0002' ? 'CB' : 'LZ',
        Passcode: `demo-${demoCase.id.toLowerCase()}`,
        Nationality: 'British',
        DOB: '1985-06-15',
        PassportNumber: 'DEMO12345678',
        HouseNumber: '42',
        Street: 'Demo Street',
        City: 'Brighton',
        County: 'East Sussex',
        Postcode: 'BN1 1AA',
        Country: 'United Kingdom',
        CompanyHouseNumber: isIndividualClientDemo ? '' : '10',
        CompanyStreet: isIndividualClientDemo ? '' : 'Enterprise Way',
        CompanyCity: isIndividualClientDemo ? '' : 'London',
        CompanyCounty: isIndividualClientDemo ? '' : 'Greater London',
        CompanyPostcode: isIndividualClientDemo ? '' : 'EC1A 1BB',
        CompanyCountry: isIndividualClientDemo ? '' : 'United Kingdom',
        PEPAndSanctionsCheckResult: (demoCase as any).pepResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
        AddressVerificationResult: (demoCase as any).addressResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
      } : undefined;
      const deal = {
        ProspectId: demoCase.id,
        InstructionRef: demoCase.instructionRef,
        Amount: demoCase.amount,
        ServiceDescription: demoCase.serviceDescription,
        DealStatus: demoCase.internalStatus,
        Passcode: `demo-${demoCase.id.toLowerCase()}`,
        PitchedBy: demoCase.id === 'DEMO-ENQ-0002' ? 'CB' : 'LZ',
        PitchedDate: new Date(demoInstructionDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        PitchedTime: new Date(demoInstructionDate.getTime() - 2 * 24 * 60 * 60 * 1000).toTimeString().split(' ')[0],
      };
      const payments = demoCase.hasPayment ? [{
        payment_status: 'succeeded',
        internal_status: 'completed',
        amount: demoCase.amount * 100,
        created_at: new Date().toISOString(),
        payment_id: `pi_demo_${demoCase.id}`,
      }] : [];
      const riskAssessments = demoCase.riskResult
        ? [{ RiskAssessmentResult: demoCase.riskResult, RiskScore: 12, RiskAssessor: currentUserEmail.split('@')[0], ComplianceDate: new Date().toISOString(), TransactionRiskLevel: 'Low' }]
        : [];
      const documents = Array.from({ length: demoCase.documents }).map((_, idx) => ({
        id: `demo-doc-${demoCase.id}-${idx + 1}`,
        filename: idx === 0 ? 'Passport_Scan.pdf' : idx === 1 ? 'Engagement_Letter_Signed.pdf' : 'Demo_Contract.pdf',
        FileName: idx === 0 ? 'Passport_Scan.pdf' : idx === 1 ? 'Engagement_Letter_Signed.pdf' : 'Demo_Contract.pdf',
        DocumentType: idx === 0 ? 'ID' : idx === 1 ? 'Engagement' : 'Contract',
        FileSizeBytes: idx === 0 ? 245000 : idx === 1 ? 182000 : 310000,
        UploadedAt: new Date().toISOString(),
      }));
      const matters = demoCase.hasMatter ? [{ MatterId: 'MAT-DEMO-001', DisplayNumber: 'HELIX01-01' }] : [];

      const eidRecord: Record<string, unknown> = {
        EIDStatus: demoCase.eidStatus,
        EIDOverallResult: demoCase.eidResult,
        EIDCheckedDate: demoCase.eidStatus === 'complete' ? demoEidDate.toISOString() : undefined,
        PEPResult: (demoCase as any).pepResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
        AddressVerification: (demoCase as any).addressResult || (demoCase.eidResult === 'Pass' ? 'Passed' : undefined),
      };

      result.set(demoCase.id, {
        isDemo: true,
        instruction,
        deal,
        clients: [{
          Email: 'demo.client@helix-law.com',
          ClientEmail: 'demo.client@helix-law.com',
          FirstName: 'Demo',
          LastName: 'Client',
          Nationality: 'British',
          DOB: '1985-06-15',
          Phone: '07700 900123',
          PassportNumber: 'DEMO12345678',
          HouseNumber: '42',
          Street: 'Demo Street',
          City: 'Brighton',
          County: 'East Sussex',
          Postcode: 'BN1 1AA',
          Country: 'United Kingdom',
        }],
        documents,
        payments,
        eid: demoCase.eidStatus !== 'pending' ? eidRecord : null,
        eids: demoCase.eidStatus !== 'pending' ? [eidRecord] : [],
        risk: riskAssessments[0] ?? null,
        riskAssessments,
        matters,
        team: currentUserEmail,
        prospectId: demoCase.id,
        ProspectId: demoCase.id,
      });
    });
  }

  return result;
}
