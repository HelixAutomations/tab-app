/** @jest-environment jsdom */
import { getActionableInstructions } from '../InstructionsPrompt.helpers';
import { InstructionData } from '../../../app/functionality/types';

describe('getActionableInstructions', () => {
    it('filters out instructions with matters and sets next action', () => {
        const sample: InstructionData[] = [
            {
                prospectId: 1,
                deals: [{ ServiceDescription: 'Service A' }],
                instructions: [{ InstructionRef: 'REF1', FirstName: 'John', LastName: 'Doe', MatterId: null }],
                documents: [],
                riskAssessments: [],
                electronicIDChecks: [],
            } as any,
            {
                prospectId: 2,
                deals: [{ ServiceDescription: 'Service B' }],
                instructions: [{ InstructionRef: 'REF2', FirstName: 'Jane', LastName: 'Smith', MatterId: 'MAT1' }],
                documents: [],
                riskAssessments: [],
                electronicIDChecks: [],
            } as any,
        ];
        const result = getActionableInstructions(sample);
        expect(result).toHaveLength(1);
        expect(result[0].nextAction).toBe('Assess Risk');
        expect(result[0].clientName).toBe('John Doe');
    });
});
