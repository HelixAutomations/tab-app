import { FormItem, SectionName } from '../../app/functionality/types';
import { financialForms } from './FinancialForms';
import BundleForm from '../../CustomForms/BundleForm';
import NotableCaseInfoForm from '../../CustomForms/NotableCaseInfoForm';
import TechIdeaForm from '../../CustomForms/TechIdeaForm';
import TechProblemForm from '../../CustomForms/TechProblemForm';
import ExpertRecommendationForm from '../../CustomForms/ExpertRecommendationForm';
import CounselRecommendationForm from '../../CustomForms/CounselRecommendationForm';
import ExpertDirectory from '../../CustomForms/ExpertDirectory';
import CounselDirectory from '../../CustomForms/CounselDirectory';

// invisible change
// Forms grouped by section (excluding Favorites which is dynamic)
export const formSections: { [key in Exclude<SectionName, 'Favorites'>]: FormItem[] } = {
    General_Processes: [
        {
            title: 'Tel. Attendance Note',
            url: 'https://www.cognitoforms.com/Helix1/TelephoneAttendanceNote',
            icon: 'Phone',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '41' },
            requires: 'Matter ref, caller details, notes',
            description: 'Record telephone attendance notes and call details for client matters',
        },
        {
            title: 'Tasks',
            url: 'https://www.cognitoforms.com/Helix1/V2Tasks',
            icon: 'BulletedList',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '90' },
            requires: 'Assignee, due date, task details',
            description: 'Create and manage general tasks and reminders for team members',
        },
        {
            title: 'Office Attendance',
            url: 'https://www.cognitoforms.com/Helix1/OfficeAttendance',
            icon: 'Calendar',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '109' },
            requires: 'Date, location',
            description: 'Log daily office attendance and working arrangements',
        },
        {
            title: 'Proof of Identity',
            url: 'https://www.cognitoforms.com/Helix1/WebFormProofOfIdentityV2',
            icon: 'Contact',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '60' },
            requires: 'Client name, ID documents',
            description: 'Verify and record client identity documents and verification status',
        },
        {
            title: 'Open a Matter',
            url: 'https://www.cognitoforms.com/Helix1/OpenAMatter',
            icon: 'FolderOpen',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '9' },
            requires: 'Client details, matter type, fee earner',
            description: 'Create new client matters and set up case management workflows',
        },
        {
            title: 'CollabSpace Requests',
            url: 'https://www.cognitoforms.com/Helix1/CollabSpaceRequests',
            icon: 'People',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '44' },
            requires: 'Matter ref, participants',
            description: 'Request shared collaboration spaces for client matter teams',
        },
    ],
    Operations: [
        {
            title: 'Call Handling',
            url: 'https://www.cognitoforms.com/Helix1/V2CallHandling',
            icon: 'Phone',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '98' },
            requires: 'Caller info, enquiry type',
            description: 'Log incoming calls and route enquiries to appropriate team members',
        },
        {
            title: 'Transaction Intake',
            url: 'https://www.cognitoforms.com/Helix1/TransactionsIntakeV2',
            icon: 'Bank',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '58' },
            requires: 'Property address, client, transaction type',
            description: 'Process and record property transaction details and requirements',
        },
        {
            title: 'Incoming Post',
            url: 'https://www.cognitoforms.com/Helix1/IncomingPost',
            icon: 'Mail',
            embedScript: { key: 'QzaAr_2Q7kesClKq8g229g', formId: '108' },
            requires: 'Recipient, sender, item type',
            description: 'Log and distribute incoming postal mail and document deliveries',
        },
        {
            title: 'Bundle',
            url: '',
            icon: 'Folder',
            component: BundleForm,
            requires: 'Matter ref, NetDocs link, hearing date',
            description: 'Submit NetDocs document bundles for court proceedings and hearings',
        },
        {
            title: 'Notable Case Info',
            url: '',
            icon: 'Important',
            component: NotableCaseInfoForm,
            requires: 'Case details, outcome, key facts',
            description: 'Record details of significant cases for legal directories and publications',
        },
    ],
    Financial: financialForms,
    // Tech_Support and Directories are passcode protected (2011)
    Tech_Support: [
        {
            title: 'Tech Development Idea',
            url: '',
            icon: 'Lightbulb',
            component: TechIdeaForm,
            requires: 'Your idea, expected benefit',
            description: 'Submit ideas for new features or improvements to Helix Hub',
        },
        {
            title: 'Report Technical Problem',
            url: '',
            icon: 'Bug',
            component: TechProblemForm,
            requires: 'Steps to reproduce, screenshots',
            description: 'Report bugs, errors, or technical issues for immediate attention',
        },
    ],
    Recommendations: [
        {
            title: 'Recommend Expert',
            url: '',
            icon: 'ContactCard',
            component: ExpertRecommendationForm,
            requires: 'Expert name, specialism, contact',
            description: 'Add a new expert witness recommendation to the directory',
        },
        {
            title: 'Recommend Counsel',
            url: '',
            icon: 'Commitments',
            component: CounselRecommendationForm,
            requires: 'Counsel name, chambers, specialism',
            description: 'Add a new barrister/counsel recommendation to the directory',
        },
    ],
    Browse_Directories: [
        {
            title: 'Expert Directory',
            url: '',
            icon: 'ContactList',
            component: ExpertDirectory,
            description: 'View and search the expert witness directory',
        },
        {
            title: 'Counsel Directory',
            url: '',
            icon: 'ContactList',
            component: CounselDirectory,
            description: 'View and search the counsel directory',
        },
    ],
};

export type FormSections = typeof formSections;