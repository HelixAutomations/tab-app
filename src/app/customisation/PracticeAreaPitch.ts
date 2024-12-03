export interface Template {
  subject: string;
  body: string;
}

export interface PracticeAreaCategory {
  [templateName: string]: Template;
}

export interface PracticeAreaPitchType {
  Commercial: PracticeAreaCategory;
  Construction: PracticeAreaCategory;
  Property: PracticeAreaCategory;
  Employment: PracticeAreaCategory;
  // Add other practice areas as needed
}

const PracticeAreaPitch: PracticeAreaPitchType = {

  Commercial: {
    "Director Rights & Dispute Advice": {
      subject: "Director Rights & Dispute Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding director rights and dispute advice. We're well-placed to assist you.

Director disputes are often complex and require expert guidance to resolve effectively.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Shareholder Rights & Dispute Advice": {
      subject: "Shareholder Rights & Dispute Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding shareholder rights and dispute advice. We're well-placed to assist you.

Shareholder disputes can disrupt businesses significantly and benefit from a structured resolution approach.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Civil/Commercial Fraud Advice": {
      subject: "Commercial Fraud Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding commercial fraud advice. We're well-placed to assist you.

Commercial fraud cases often require swift and precise action to mitigate losses.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Partnership Advice": {
      subject: "Partnership Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding partnership advice. We're well-placed to assist you.

Partnership matters often involve intricate legal considerations that we can help navigate effectively.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Business Contract Dispute": {
      subject: "Business Contract Dispute",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your business contract dispute. We're well-placed to assist you.

Business contract disputes require clear and decisive action to protect your interests.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Unpaid Loan Recovery": {
      subject: "Unpaid Loan Recovery",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding unpaid loan recovery. We're well-placed to assist you.

Recovering unpaid loans efficiently is crucial for maintaining your business's financial health.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Contentious Probate": {
      subject: "Contentious Probate",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding contentious probate. We're well-placed to assist you.

Contentious probate matters require sensitive and expert handling to ensure fair outcomes.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Statutory Demand - Drafting": {
      subject: "Statutory Demand - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding statutory demand drafting. We're well-placed to assist you.

Drafting statutory demands accurately is essential for effective debt recovery.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Statutory Demand - Advising": {
      subject: "Statutory Demand - Advising",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding statutory demand advising. We're well-placed to assist you.

Advising on statutory demands ensures you understand your rights and obligations fully.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Winding Up Petition Advice": {
      subject: "Winding Up Petition Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding winding up petition advice. We're well-placed to assist you.

Winding up petitions require strategic advice to navigate the complexities involved.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Bankruptcy Petition Advice": {
      subject: "Bankruptcy Petition Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding bankruptcy petition advice. We're well-placed to assist you.

Bankruptcy petitions necessitate careful planning and informed decision-making.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Injunction Advice": {
      subject: "Injunction Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding injunction advice. We're well-placed to assist you.

Injunctions are powerful legal tools that require precise application to be effective.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Intellectual Property": {
      subject: "Intellectual Property Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding intellectual property matters. We're well-placed to assist you.

Protecting your intellectual property is vital for maintaining your competitive edge.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Professional Negligence": {
      subject: "Professional Negligence Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding professional negligence. We're well-placed to assist you.

Addressing professional negligence requires thorough investigation and expert legal action.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Unpaid Invoice/Debt Dispute": {
      subject: "Unpaid Invoice or Debt Dispute",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding unpaid invoices or debt disputes. We're well-placed to assist you.

Resolving unpaid invoices swiftly is essential for maintaining your business's cash flow.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Commercial Contract - Drafting": {
      subject: "Commercial Contract - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding commercial contract drafting. We're well-placed to assist you.

Drafting robust commercial contracts is key to safeguarding your business interests.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Company Restoration": {
      subject: "Company Restoration Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding company restoration. We're well-placed to assist you.

Restoring your company requires a strategic approach to navigate legal and financial challenges.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Small Claim Advice": {
      subject: "Small Claim Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding small claim advice. We're well-placed to assist you.

Handling small claims effectively ensures timely and cost-efficient resolutions.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Trust Advice": {
      subject: "Trust Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding trust advice. We're well-placed to assist you.

Managing trusts requires meticulous legal oversight to ensure compliance and efficacy.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Terms and Conditions - Drafting": {
      subject: "Terms and Conditions - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding drafting terms and conditions. We're well-placed to assist you.

Well-drafted terms and conditions protect your business and set clear expectations.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your enquiry. We're well-placed to assist you.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
  },

  Construction: {
    "Final Account Recovery": {
      subject: "Final Account Recovery",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding final account recovery. We're well-placed to assist you.

Recovering final accounts promptly ensures financial stability for ongoing projects.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Retention Recovery Advice": {
      subject: "Retention Recovery Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding retention recovery advice. We're well-placed to assist you.

Retention recovery disputes often require clear contractual understanding to resolve effectively.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Adjudication Advice & Dispute": {
      subject: "Adjudication Advice & Dispute",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding adjudication advice and dispute. We're well-placed to assist you.

Adjudication disputes require timely and informed legal intervention to ensure fair outcomes.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Construction Contract Advice": {
      subject: "Construction Contract Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding construction contract advice. We're well-placed to assist you.

Providing sound construction contract advice is essential for the success and compliance of your projects.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Interim Payment Recovery": {
      subject: "Interim Payment Recovery",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding interim payment recovery. We're well-placed to assist you.

Recovering interim payments ensures the smooth financial flow of your construction projects.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Contract Dispute": {
      subject: "Contract Dispute Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding a contract dispute. We're well-placed to assist you.

Resolving contract disputes promptly is crucial to maintaining project timelines and relationships.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your enquiry. We're well-placed to assist you.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
  },

  Property: {
    "Landlord & Tenant - Commercial Dispute": {
      subject: "Landlord & Tenant - Commercial Dispute",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your landlord & tenant - commercial dispute. We're well-placed to assist you.

Landlord and tenant disputes require a balanced approach to protect interests effectively.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Landlord & Tenant - Residential Dispute": {
      subject: "Landlord & Tenant - Residential Dispute",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your landlord & tenant - residential dispute. We're well-placed to assist you.

Residential disputes can escalate quickly and benefit from timely, informed action.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Boundary and Nuisance Advice": {
      subject: "Boundary and Nuisance Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding boundary and nuisance advice. We're well-placed to assist you.

Boundary and nuisance matters require clear legal guidance to resolve effectively.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Trust of Land (TOLATA) Advice": {
      subject: "Trust of Land (TOLATA) Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding Trust of Land (TOLATA) advice. We're well-placed to assist you.

TOLATA matters involve specific legal frameworks that we can navigate on your behalf.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Service Charge Recovery & Dispute Advice": {
      subject: "Service Charge Recovery & Dispute Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding service charge recovery and dispute advice. We're well-placed to assist you.

Effective management of service charge disputes is essential for maintaining property relationships.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Breach of Lease Advice": {
      subject: "Breach of Lease Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding breach of lease advice. We're well-placed to assist you.

Addressing breaches of lease agreements requires precise legal intervention to protect your interests.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Terminal Dilapidations Advice": {
      subject: "Terminal Dilapidations Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding terminal dilapidations advice. We're well-placed to assist you.

Managing terminal dilapidations effectively ensures compliance and mitigates potential disputes.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Investment Sale and Ownership - Advice": {
      subject: "Investment Sale and Ownership Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding investment sale and ownership advice. We're well-placed to assist you.

Strategic advice on investment sales and ownership structures can significantly benefit your business operations.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Trespass": {
      subject: "Trespass Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding trespass matters. We're well-placed to assist you.

Addressing trespass issues promptly is essential to protect your property rights.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Right of Way": {
      subject: "Right of Way Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding right of way matters. We're well-placed to assist you.

Ensuring clear and enforceable rights of way is crucial for property management and usage.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your enquiry. We're well-placed to assist you.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
  },

  Employment: {
    "Employment Contract - Drafting": {
      subject: "Employment Contract - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding employment contract drafting. We're well-placed to assist you.

Drafting employment contracts correctly is crucial to ensuring compliance and avoiding future disputes.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Employment Retainer Instruction": {
      subject: "Employment Retainer Instruction",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding employment retainer instruction. We're well-placed to assist you.

Establishing a retainer agreement ensures ongoing support for your employment law needs.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Settlement Agreement - Drafting": {
      subject: "Settlement Agreement - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding settlement agreement drafting. We're well-placed to assist you.

Drafting settlement agreements accurately is essential for fair and enforceable resolutions.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Settlement Agreement - Advising": {
      subject: "Settlement Agreement - Advising",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding settlement agreement advising. We're well-placed to assist you.

Providing expert advice on settlement agreements ensures clear and mutually beneficial terms.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Handbook - Drafting": {
      subject: "Handbook - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding handbook drafting. We're well-placed to assist you.

Creating comprehensive employee handbooks is vital for clear workplace policies and compliance.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Policy - Drafting": {
      subject: "Policy - Drafting",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding policy drafting. We're well-placed to assist you.

Drafting effective workplace policies is essential for maintaining a compliant and harmonious work environment.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Redundancy - Advising": {
      subject: "Redundancy - Advising",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding redundancy advising. We're well-placed to assist you.

Providing clear and compassionate advice on redundancies helps manage the process smoothly and fairly.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Sick Leave - Advising": {
      subject: "Sick Leave - Advising",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding sick leave advising. We're well-placed to assist you.

Offering guidance on sick leave policies ensures compliance and supports employee well-being.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Disciplinary - Advising": {
      subject: "Disciplinary - Advising",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding disciplinary advising. We're well-placed to assist you.

Navigating disciplinary actions requires careful legal consideration to ensure fairness and compliance.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Restrictive Covenant Advice": {
      subject: "Restrictive Covenant Advice",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding restrictive covenant advice. We're well-placed to assist you.

Ensuring your restrictive covenants are enforceable protects your business interests effectively.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Post Termination Dispute": {
      subject: "Post Termination Dispute Assistance",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding post termination disputes. We're well-placed to assist you.

Resolving post termination disputes promptly helps maintain professional relationships and legal compliance.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Employment Tribunal Claim - Advising": {
      subject: "Employment Tribunal Claim - Advising",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding employment tribunal claim advising. We're well-placed to assist you.

Providing expert advice for tribunal claims ensures your case is presented effectively and professionally.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      body: `
Dear [Enquiry.First_Name],

Thank you for reaching out regarding your enquiry. We're well-placed to assist you.

[Scope Placeholder]

[Fee Option Placeholder]

[Required Documents Placeholder]

[Payment Link Placeholder]

Kind regards,  
[Enquiry.Point_of_Contact]
`,
    },
  },
};

export default PracticeAreaPitch;