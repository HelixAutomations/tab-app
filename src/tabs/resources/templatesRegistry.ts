import PracticeAreaPitch from '../../app/customisation/PracticeAreaPitch';
import { templateBlockSets } from '../../app/customisation/TemplateBlockSets';

export interface HubCommsTemplateFamily {
  id: string;
  title: string;
  status: 'live' | 'mapped' | 'partial';
  summary: string;
  stat: string;
  owners: string[];
}

const practiceAreaScenarioCount = Object.values(PracticeAreaPitch).reduce((count, category) => {
  return count + Object.keys(category || {}).length;
}, 0);

const productionBlockCount = templateBlockSets.Production.length;
const simplifiedBlockCount = templateBlockSets.Simplified.length;

export const HUB_COMMS_TEMPLATE_FAMILIES: HubCommsTemplateFamily[] = [
  {
    id: 'notifications',
    title: 'Notification templates',
    status: 'live',
    summary: 'Adaptive Card notification templates and one-off Teams sends used by Hub operational comms.',
    stat: 'Card Lab library',
    owners: [
      'server/activity-card-lab/catalog.js',
      'server/utils/hubNotifier.js',
      'src/tabs/roadmap/parts/ActivityCardLabPanel.tsx',
    ],
  },
  {
    id: 'pitch-scenarios',
    title: 'Pitch builder scenarios',
    status: 'live',
    summary: 'Practice-area subject and intro scenarios that shape the opening email in Pitch Builder.',
    stat: `${practiceAreaScenarioCount} scenarios`,
    owners: [
      'src/app/customisation/PracticeAreaPitch.ts',
      'src/tabs/enquiries/PitchBuilder.tsx',
    ],
  },
  {
    id: 'pitch-blocks',
    title: 'Pitch builder blocks',
    status: 'live',
    summary: 'Reusable body blocks, next-step language, and funding sections used by the enquiry drafting flow.',
    stat: `${productionBlockCount} production · ${simplifiedBlockCount} simplified`,
    owners: [
      'src/app/customisation/TemplateBlockSets.ts',
      'src/app/customisation/ProductionTemplateBlocks.ts',
      'src/app/customisation/SimplifiedTemplateBlocks.ts',
    ],
  },
  {
    id: 'signatures',
    title: 'Email signatures',
    status: 'live',
    summary: 'Shared signature shell plus personal signature append logic used by outbound Hub emails.',
    stat: 'Server-appended personal signatures',
    owners: [
      'server/routes/sendEmail.js',
      'src/tabs/enquiries/EmailSignature.tsx',
      'src/tabs/enquiries/pitch-composer/usePitchComposer.ts',
    ],
  },
  {
    id: 'document-requests',
    title: 'Document request emails',
    status: 'live',
    summary: 'Verification document request draft and send flows that currently live outside the Templates surface.',
    stat: 'Draft + send routes',
    owners: [
      'src/services/verificationAPI.ts',
      'server/routes/sendEmail.js',
    ],
  },
  {
    id: 'ccl',
    title: 'CCL templates and send path',
    status: 'partial',
    summary: 'Client Care Letter template, prompt feedback loop, and the internal-only send guard now landing in the review flow.',
    stat: 'Feedback loop in progress',
    owners: [
      'src/shared/ccl/cclTemplate.ts',
      'server/routes/ccl-ai.js',
      'server/routes/ccl-ops.js',
    ],
  },
  {
    id: 'frameworks',
    title: 'Communication frameworks',
    status: 'mapped',
    summary: 'Pressure-test prompt families for management, tasking, feedback, projects, communication, and legal comms.',
    stat: '6 framework families',
    owners: [
      'server/prompts/communication-frameworks.js',
      'server/routes/ai.js',
    ],
  },
];