import { deriveProspectJourneyState, isInstructionShellStage } from '../workbenchJourneyState';

describe('workbenchJourneyState', () => {
  it('treats initialised instruction rows as checkout shells, not completed instructions', () => {
    const state = deriveProspectJourneyState({
      workbenchItem: {
        instruction: {
          InstructionRef: 'HLX-30838-52686',
          ProspectId: '30838',
          Stage: 'initialised',
        },
        deal: {
          InstructionRef: 'HLX-30838-52686',
          ProspectId: '30838',
          Status: 'pitched',
          Passcode: '52686',
        },
        ProspectId: '30838',
      },
      enquiry: {
        ID: '30838',
        ACID: '30838',
        Point_of_Contact: 'lz@helix-law.com',
      },
    });

    expect(state.hasPitchEvidence).toBe(true);
    expect(state.isInstructionShell).toBe(true);
    expect(state.isInstructionSubmitted).toBe(false);
    expect(state.stages.pitch.status).toBe('complete');
    expect(state.stages.instruction.status).toBe('processing');
    expect(state.stages.instruction.statusText).toBe('Checkout opened');
    expect(state.stages.identity.status).toBe('blocked');
    expect(state.canRunIdCheck).toBe(false);
    expect(state.idBlockedReason).toBe('Client has not submitted the instruction form yet');
  });

  it('marks submitted instructions with identity data as ready for ID verification', () => {
    const state = deriveProspectJourneyState({
      workbenchItem: {
        instruction: {
          InstructionRef: 'HLX-12345-67890',
          ProspectId: '12345',
          Stage: 'submitted',
          SubmissionDate: '2026-06-29T10:00:00Z',
          DOB: '1990-01-01',
          PassportNumber: '123456789',
          HouseNumber: '1',
          Street: 'Example Street',
          Postcode: 'BN1 1AA',
        },
        deal: {
          InstructionRef: 'HLX-12345-67890',
          ProspectId: '12345',
          Status: 'instructed',
        },
      },
    });

    expect(state.isInstructionShell).toBe(false);
    expect(state.isInstructionSubmitted).toBe(true);
    expect(state.stages.instruction.status).toBe('complete');
    expect(state.stages.identity.status).toBe('pending');
    expect(state.canRunIdCheck).toBe(true);
  });

  it('normalises spelling variants for shell stages', () => {
    expect(isInstructionShellStage('initialised')).toBe(true);
    expect(isInstructionShellStage('initialized')).toBe(true);
    expect(isInstructionShellStage('proof-of-id-complete')).toBe(false);
  });
});
