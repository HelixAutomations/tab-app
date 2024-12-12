// src/app/customisation/PracticeAreaPitch.ts

export interface Template {
  subject: string;
  intro: string;
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
      intro: `Thank you for reaching out regarding director rights and dispute advice. We're well-placed to assist you.
      
Director disputes are often complex and require expert guidance to resolve effectively.`,
    },
    "Shareholder Rights & Dispute Advice": {
      subject: "Shareholder Rights & Dispute Advice",
      intro: `Thank you for reaching out regarding shareholder rights and dispute advice. We're well-placed to assist you.
      
Shareholder disputes can disrupt businesses significantly and benefit from a structured resolution approach.`,
    },
    "Civil/Commercial Fraud Advice": {
      subject: "Commercial Fraud Advice",
      intro: `Thank you for reaching out regarding commercial fraud advice. We're well-placed to assist you.
      
Commercial fraud cases often require swift and precise action to mitigate losses.`,
    },
    "Partnership Advice": {
      subject: "Partnership Advice",
      intro: `Thank you for reaching out regarding partnership advice. We're well-placed to assist you.
      
Partnership matters often involve intricate legal considerations that we can help navigate effectively.`,
    },
    "Business Contract Dispute": {
      subject: "Business Contract Dispute",
      intro: `Thank you for reaching out regarding your business contract dispute. We're well-placed to assist you.
      
Business contract disputes require clear and decisive action to protect your interests.`,
    },
    "Unpaid Loan Recovery": {
      subject: "Unpaid Loan Recovery",
      intro: `Thank you for reaching out regarding unpaid loan recovery. We're well-placed to assist you.
      
Recovering unpaid loans efficiently is crucial for maintaining your business's financial health.`,
    },
    "Contentious Probate": {
      subject: "Contentious Probate",
      intro: `Thank you for reaching out regarding contentious probate. We're well-placed to assist you.
      
Contentious probate matters require sensitive and expert handling to ensure fair outcomes.`,
    },
    "Statutory Demand - Drafting": {
      subject: "Statutory Demand - Drafting",
      intro: `Thank you for reaching out regarding statutory demand drafting. We're well-placed to assist you.
      
Drafting statutory demands accurately is essential for effective debt recovery.`,
    },
    "Statutory Demand - Advising": {
      subject: "Statutory Demand - Advising",
      intro: `Thank you for reaching out regarding statutory demand advising. We're well-placed to assist you.
      
Advising on statutory demands ensures you understand your rights and obligations fully.`,
    },
    "Winding Up Petition Advice": {
      subject: "Winding Up Petition Advice",
      intro: `Thank you for reaching out regarding winding up petition advice. We're well-placed to assist you.
      
Winding up petitions require strategic advice to navigate the complexities involved.`,
    },
    "Bankruptcy Petition Advice": {
      subject: "Bankruptcy Petition Advice",
      intro: `Thank you for reaching out regarding bankruptcy petition advice. We're well-placed to assist you.
      
Bankruptcy petitions necessitate careful planning and informed decision-making.`,
    },
    "Injunction Advice": {
      subject: "Injunction Advice",
      intro: `Thank you for reaching out regarding injunction advice. We're well-placed to assist you.
      
Injunctions are powerful legal tools that require precise application to be effective.`,
    },
    "Intellectual Property": {
      subject: "Intellectual Property Assistance",
      intro: `Thank you for reaching out regarding intellectual property matters. We're well-placed to assist you.
      
Protecting your intellectual property is vital for maintaining your competitive edge.`,
    },
    "Professional Negligence": {
      subject: "Professional Negligence Assistance",
      intro: `Thank you for reaching out regarding professional negligence. We're well-placed to assist you.
      
Addressing professional negligence requires thorough investigation and expert legal action.`,
    },
    "Unpaid Invoice/Debt Dispute": {
      subject: "Unpaid Invoice or Debt Dispute",
      intro: `Thank you for reaching out regarding unpaid invoices or debt disputes. We're well-placed to assist you.
      
Resolving unpaid invoices swiftly is essential for maintaining your business's cash flow.`,
    },
    "Commercial Contract - Drafting": {
      subject: "Commercial Contract - Drafting",
      intro: `Thank you for reaching out regarding commercial contract drafting. We're well-placed to assist you.
      
Drafting robust commercial contracts is key to safeguarding your business interests.`,
    },
    "Company Restoration": {
      subject: "Company Restoration Assistance",
      intro: `Thank you for reaching out regarding company restoration. We're well-placed to assist you.
      
Restoring your company requires a strategic approach to navigate legal and financial challenges.`,
    },
    "Small Claim Advice": {
      subject: "Small Claim Advice",
      intro: `Thank you for reaching out regarding small claim advice. We're well-placed to assist you.
      
Handling small claims effectively ensures timely and cost-efficient resolutions.`,
    },
    "Trust Advice": {
      subject: "Trust Advice",
      intro: `Thank you for reaching out regarding trust advice. We're well-placed to assist you.
      
Managing trusts requires meticulous legal oversight to ensure compliance and efficacy.`,
    },
    "Terms and Conditions - Drafting": {
      subject: "Terms and Conditions - Drafting",
      intro: `Thank you for reaching out regarding drafting terms and conditions. We're well-placed to assist you.
      
Well-drafted terms and conditions protect your business and set clear expectations.`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      intro: `Thank you for reaching out regarding your enquiry. We're well-placed to assist you.`,
    },
  },

  Construction: {
    "Final Account Recovery": {
      subject: "Final Account Recovery",
      intro: `Thank you for reaching out regarding final account recovery. We're well-placed to assist you.
      
Recovering final accounts promptly ensures financial stability for ongoing projects.`,
    },
    "Retention Recovery Advice": {
      subject: "Retention Recovery Advice",
      intro: `Thank you for reaching out regarding retention recovery advice. We're well-placed to assist you.
      
Retention recovery disputes often require clear contractual understanding to resolve effectively.`,
    },
    "Adjudication Advice & Dispute": {
      subject: "Adjudication Advice & Dispute",
      intro: `Thank you for reaching out regarding adjudication advice and dispute. We're well-placed to assist you.
      
Adjudication disputes require timely and informed legal intervention to ensure fair outcomes.`,
    },
    "Construction Contract Advice": {
      subject: "Construction Contract Advice",
      intro: `Thank you for reaching out regarding construction contract advice. We're well-placed to assist you.
      
Providing sound construction contract advice is essential for the success and compliance of your projects.`,
    },
    "Interim Payment Recovery": {
      subject: "Interim Payment Recovery",
      intro: `Thank you for reaching out regarding interim payment recovery. We're well-placed to assist you.
      
Recovering interim payments ensures the smooth financial flow of your construction projects.`,
    },
    "Contract Dispute": {
      subject: "Contract Dispute Assistance",
      intro: `Thank you for reaching out regarding a contract dispute. We're well-placed to assist you.
      
Resolving contract disputes promptly is crucial to maintaining project timelines and relationships.`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      intro: `Thank you for reaching out regarding your enquiry. We're well-placed to assist you.`,
    },
  },

  Property: {
    "Landlord & Tenant - Commercial Dispute": {
      subject: "Landlord & Tenant - Commercial Dispute",
      intro: `Thank you for reaching out regarding your landlord & tenant - commercial dispute. We're well-placed to assist you.
      
Landlord and tenant disputes require a balanced approach to protect interests effectively.`,
    },
    "Landlord & Tenant - Residential Dispute": {
      subject: "Landlord & Tenant - Residential Dispute",
      intro: `Thank you for reaching out regarding your landlord & tenant - residential dispute. We're well-placed to assist you.
      
Residential disputes can escalate quickly and benefit from timely, informed action.`,
    },
    "Boundary and Nuisance Advice": {
      subject: "Boundary and Nuisance Advice",
      intro: `Thank you for reaching out regarding boundary and nuisance advice. We're well-placed to assist you.
      
Boundary and nuisance matters require clear legal guidance to resolve effectively.`,
    },
    "Trust of Land (TOLATA) Advice": {
      subject: "Trust of Land (TOLATA) Advice",
      intro: `Thank you for reaching out regarding Trust of Land (TOLATA) advice. We're well-placed to assist you.
      
TOLATA matters involve specific legal frameworks that we can navigate on your behalf.`,
    },
    "Service Charge Recovery & Dispute Advice": {
      subject: "Service Charge Recovery & Dispute Advice",
      intro: `Thank you for reaching out regarding service charge recovery and dispute advice. We're well-placed to assist you.
      
Effective management of service charge disputes is essential for maintaining property relationships.`,
    },
    "Breach of Lease Advice": {
      subject: "Breach of Lease Advice",
      intro: `Thank you for reaching out regarding breach of lease advice. We're well-placed to assist you.
      
Addressing breaches of lease agreements requires precise legal intervention to protect your interests.`,
    },
    "Terminal Dilapidations Advice": {
      subject: "Terminal Dilapidations Advice",
      intro: `Thank you for reaching out regarding terminal dilapidations advice. We're well-placed to assist you.
      
Managing terminal dilapidations effectively ensures compliance and mitigates potential disputes.`,
    },
    "Investment Sale and Ownership - Advice": {
      subject: "Investment Sale and Ownership Advice",
      intro: `Thank you for reaching out regarding investment sale and ownership advice. We're well-placed to assist you.
      
Strategic advice on investment sales and ownership structures can significantly benefit your business operations.`,
    },
    "Trespass": {
      subject: "Trespass Assistance",
      intro: `Thank you for reaching out regarding trespass matters. We're well-placed to assist you.
      
Addressing trespass issues promptly is essential to protect your property rights.`,
    },
    "Right of Way": {
      subject: "Right of Way Assistance",
      intro: `Thank you for reaching out regarding right of way matters. We're well-placed to assist you.
      
Ensuring clear and enforceable rights of way is crucial for property management and usage.`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      intro: `Thank you for reaching out regarding your enquiry. We're well-placed to assist you.`,
    },
  },

  Employment: {
    "Employment Contract - Drafting": {
      subject: "Employment Contract - Drafting",
      intro: `Thank you for reaching out regarding employment contract drafting. We're well-placed to assist you.
      
Drafting employment contracts correctly is crucial to ensuring compliance and avoiding future disputes.`,
    },
    "Employment Retainer Instruction": {
      subject: "Employment Retainer Instruction",
      intro: `Thank you for reaching out regarding employment retainer instruction. We're well-placed to assist you.
      
Establishing a retainer agreement ensures ongoing support for your employment law needs.`,
    },
    "Settlement Agreement - Drafting": {
      subject: "Settlement Agreement - Drafting",
      intro: `Thank you for reaching out regarding settlement agreement drafting. We're well-placed to assist you.
      
Drafting settlement agreements accurately is essential for fair and enforceable resolutions.`,
    },
    "Settlement Agreement - Advising": {
      subject: "Settlement Agreement - Advising",
      intro: `Thank you for reaching out regarding settlement agreement advising. We're well-placed to assist you.
      
Providing expert advice on settlement agreements ensures clear and mutually beneficial terms.`,
    },
    "Handbook - Drafting": {
      subject: "Handbook - Drafting",
      intro: `Thank you for reaching out regarding handbook drafting. We're well-placed to assist you.
      
Creating comprehensive employee handbooks is vital for clear workplace policies and compliance.`,
    },
    "Policy - Drafting": {
      subject: "Policy - Drafting",
      intro: `Thank you for reaching out regarding policy drafting. We're well-placed to assist you.
      
Drafting effective workplace policies is essential for maintaining a compliant and harmonious work environment.`,
    },
    "Redundancy - Advising": {
      subject: "Redundancy - Advising",
      intro: `Thank you for reaching out regarding redundancy advising. We're well-placed to assist you.
      
Providing clear and compassionate advice on redundancies helps manage the process smoothly and fairly.`,
    },
    "Sick Leave - Advising": {
      subject: "Sick Leave - Advising",
      intro: `Thank you for reaching out regarding sick leave advising. We're well-placed to assist you.
      
Offering guidance on sick leave policies ensures compliance and supports employee well-being.`,
    },
    "Disciplinary - Advising": {
      subject: "Disciplinary - Advising",
      intro: `Thank you for reaching out regarding disciplinary advising. We're well-placed to assist you.
      
Navigating disciplinary actions requires careful legal consideration to ensure fairness and compliance.`,
    },
    "Restrictive Covenant Advice": {
      subject: "Restrictive Covenant Advice",
      intro: `Thank you for reaching out regarding restrictive covenant advice. We're well-placed to assist you.
      
Ensuring your restrictive covenants are enforceable protects your business interests effectively.`,
    },
    "Post Termination Dispute": {
      subject: "Post Termination Dispute Assistance",
      intro: `Thank you for reaching out regarding post termination disputes. We're well-placed to assist you.
      
Resolving post termination disputes promptly helps maintain professional relationships and legal compliance.`,
    },
    "Employment Tribunal Claim - Advising": {
      subject: "Employment Tribunal Claim - Advising",
      intro: `Thank you for reaching out regarding employment tribunal claim advising. We're well-placed to assist you.
      
Providing expert advice for tribunal claims ensures your case is presented effectively and professionally.`,
    },
    "Miscellaneous (None of the above)": {
      subject: "Assistance with Your Enquiry",
      intro: `Thank you for reaching out regarding your enquiry. We're well-placed to assist you.`,
    },
  },
};

export default PracticeAreaPitch;
