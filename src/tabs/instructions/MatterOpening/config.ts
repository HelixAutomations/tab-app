//
export type StepKey = // invisible change
// invisible change 2.2
    | 'clientInfo'
    | 'poidSelection'
    | 'areaOfWork'
    | 'practiceArea'
    | 'description'
    | 'folderStructure'
    | 'disputeValue'
    | 'source'
    | 'opponentDetails'
    | 'review';

export const stepTitles: { [key in StepKey]: string } = {
    clientInfo: 'Main Details',
    poidSelection: 'Choose Proof of Identity',
    areaOfWork: 'Select Area of Work',
    practiceArea: 'Select Practice Area',
    description: 'Enter Description',
    folderStructure: 'Select NetDocuments Folder Structure',
    disputeValue: 'Select Value of the Dispute',
    source: 'Select Source & Confirm Referrer (if applicable)',
    opponentDetails: 'Confirm Opponent Details',
    review: 'Review & Build Matter',
};

export const practiceAreasByArea: { [key: string]: string[] } = {
    Commercial: [
        'Director Rights & Dispute Advice',
        'Shareholder Rights & Dispute Advice',
        'Civil/Commercial Fraud Advice',
        'Partnership Advice',
        'Business Contract Dispute',
        'Unpaid Loan Recovery',
        'Contentious Probate',
        'Statutory Demand - Drafting',
        'Statutory Demand - Advising',
        'Winding Up Petition Advice',
        'Bankruptcy Petition Advice',
        'Injunction Advice',
        'Intellectual Property',
        'Professional Negligence',
        'Unpaid Invoice/Debt Dispute',
        'Commercial Contract - Drafting',
        'Company Restoration',
        'Small Claim Advice',
        'Trust Advice',
        'Terms and Conditions - Drafting',
        'Miscellaneous',
    ],
    Construction: [
        'Final Account Recovery',
        'Retention Recovery Advice',
        'Adjudication Advice & Dispute',
        'Construction Contract Advice',
        'Interim Payment Recovery',
        'Contract Dispute',
        'Miscellaneous',
    ],
    Property: [
        'Landlord & Tenant – Commercial Dispute',
        'Landlord & Tenant – Residential Dispute',
        'Boundary and Nuisance Advice',
        'Trust of Land (Tolata) Advice',
        'Service Charge Recovery & Dispute Advice',
        'Breach of Lease Advice',
        'Terminal Dilapidations Advice',
        'Investment Sale and Ownership – Advice',
        'Trespass',
        'Right of Way',
        'Miscellaneous',
    ],
    Employment: [
        'Employment Contract - Drafting',
        'Employment Retainer Instruction',
        'Settlement Agreement - Drafting',
        'Settlement Agreement - Advising',
        'Handbook - Drafting',
        'Policy - Drafting',
        'Redundancy - Advising',
        'Sick Leave - Advising',
        'Disciplinary - Advising',
        'Restrictive Covenant Advice',
        'Post Termination Dispute',
        'Employment Tribunal Claim - Advising',
        'Miscellaneous',
    ],
};

export const getPracticeAreaOptions = (areaOfWork: string): string[] => {
    const options = practiceAreasByArea[areaOfWork] || [];
    return options.filter((practiceArea) => practiceArea !== areaOfWork && practiceArea !== 'Commercial');
};

export const normalisePracticeArea = (areaOfWork: string, practiceArea: string | null | undefined): string => {
    const candidate = String(practiceArea || '').trim();
    if (!candidate) return '';
    return getPracticeAreaOptions(areaOfWork).includes(candidate) ? candidate : '';
};

export const resolveMatterPracticeArea = (
    areaOfWork: string | null | undefined,
    practiceArea: string | null | undefined,
): string => {
    return normalisePracticeArea(String(areaOfWork || '').trim(), practiceArea);
};

export const partnerOptions = ['Alex', 'Jonathan', 'Luke', 'Kanchel'];

export const getGroupColor = (group: string): string => {
    switch (group) {
        case 'Commercial':
            return '#91a7ff';
        case 'Construction':
            return '#ffba08';
        case 'Property':
            return '#4ecdc4';
        case 'Employment':
            return '#ffd166';
        default:
            return '#ff686b';
    }
};

