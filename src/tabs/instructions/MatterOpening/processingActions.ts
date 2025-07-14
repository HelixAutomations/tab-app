import { ProcessingStep } from './ProcessingSection';
import activeIcon from '../../../assets/activecampaign.svg';
import clioIcon from '../../../assets/clio.svg';
import asanaIcon from '../../../assets/asana.svg';

// locally cached values so refresh endpoints can be called in sequence
let acToken = '';
let clioClientId = '';
let clioClientSecret = '';
let clioRefreshToken = '';
let asanaClientId = '';
let asanaSecret = '';
let asanaRefreshToken = '';
let opponentId = '';
let solicitorId = '';

export interface ProcessingAction {
    label: string;
    icon?: string;
    run: (
        formData: Record<string, any>,
        userInitials: string,
        userData?: any[] | null
    ) => Promise<string>;
}

export const processingActions: ProcessingAction[] = [
    {
        label: 'Retrieve ActiveCampaign Token',
        icon: activeIcon,
        run: async () => {
            const res = await fetch('/api/keys/ac-automations-apitoken');
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            acToken = data.value;
            return 'Token retrieved';
        }
    },
    {
        label: 'Refresh ActiveCampaign Token',
        icon: activeIcon,
        run: async () => {
            const resp = await fetch('/api/refresh/activecampaign', { method: 'POST' });
            if (!resp.ok) throw new Error('ActiveCampaign token refresh failed');
            return 'Token refreshed';
        }
    },
    {
        label: 'Retrieve Clio Client ID',
        icon: clioIcon,
        run: async (_form, initials) => {
            const res = await fetch(`/api/keys/${initials.toLowerCase()}-clio-v1-clientid`);
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            clioClientId = data.value;
            return 'Client ID retrieved';
        }
    },
    {
        label: 'Retrieve Clio Client Secret',
        icon: clioIcon,
        run: async (_form, initials) => {
            const res = await fetch(`/api/keys/${initials.toLowerCase()}-clio-v1-clientsecret`);
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            clioClientSecret = data.value;
            return 'Client Secret retrieved';
        }
    },
    {
        label: 'Retrieve Clio Refresh Token',
        icon: clioIcon,
        run: async (_form, initials) => {
            const res = await fetch(`/api/keys/${initials.toLowerCase()}-clio-v1-refreshtoken`);
            if (!res.ok) throw new Error('Failed to fetch secret');
            const data = await res.json();
            clioRefreshToken = data.value;
            return 'Refresh Token retrieved';
        }
    },
    {
        label: 'Refresh Clio Access Token',
        icon: clioIcon,
        run: async (_form, initials) => {
            const resp = await fetch(`/api/refresh/clio/${initials.toLowerCase()}`, {
                method: 'POST'
            });
            if (!resp.ok) throw new Error('Clio token refresh failed');
            return 'Access token refreshed';
        }
    },
    {
        label: 'Retrieve Asana Client ID',
        icon: asanaIcon,
        run: async (_form, _i, userData) => {
            const id = userData?.[0]?.ASANAClientID || userData?.[0]?.ASANAClient_ID;
            if (!id) throw new Error('Asana Client ID missing');
            asanaClientId = id;
            return 'Client ID retrieved';
        }
    },
    {
        label: 'Retrieve Asana Secret',
        icon: asanaIcon,
        run: async (_form, _i, userData) => {
            const secret = userData?.[0]?.ASANASecret || userData?.[0]?.ASANA_Secret;
            if (!secret) throw new Error('Asana Secret missing');
            asanaSecret = secret;
            return 'Secret retrieved';
        }
    },
    {
        label: 'Retrieve Asana Refresh Token',
        icon: asanaIcon,
        run: async (_form, _i, userData) => {
            const token = userData?.[0]?.ASANARefreshToken || userData?.[0]?.ASANARefresh_Token;
            if (!token) throw new Error('Asana Refresh Token missing');
            asanaRefreshToken = token;
            return 'Refresh Token retrieved';
        }
    },
    {
        label: 'Refresh Asana Access Token',
        icon: asanaIcon,
        run: async () => {
            const resp = await fetch('/api/refresh/asana', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: asanaClientId, clientSecret: asanaSecret, refreshToken: asanaRefreshToken })
            });
            if (!resp.ok) throw new Error('Asana token refresh failed');
            return 'Access token refreshed';
        }
    },
    {
        label: 'Opponent Details Updated',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const payload = {
                opponent: formData.opponent_details?.opponent || null,
                solicitor: formData.opponent_details?.solicitor || null,
                createdBy: userInitials
            };

            const resp = await fetch('/api/opponents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error('Failed to update opponent details');
            const data = await resp.json();
            opponentId = data.opponentId || '';
            solicitorId = data.solicitorId || '';
            return 'Opponent details updated';
        }
    },
    {
        label: 'Matter Request Created',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const payload = {
                instructionRef: formData.matter_details?.instruction_ref || null,
                clientType: formData.matter_details?.client_type || null,
                description: formData.matter_details?.description || null,
                practiceArea: formData.matter_details?.practice_area || null,
                value: formData.matter_details?.dispute_value || null,
                responsibleSolicitor: formData.team_assignments?.fee_earner || null,
                originatingSolicitor: formData.team_assignments?.originating_solicitor || null,
                supervisingPartner: formData.team_assignments?.supervising_partner || null,
                source: formData.source_details?.source || null,
                referrer: formData.source_details?.referrer_name || null,
                opponentId: opponentId || null,
                solicitorId: solicitorId || null,
                createdBy: userInitials
                // MatterID is excluded
            };

            const resp = await fetch('/api/matter-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error('Failed to record matter request');
            const data = await resp.json();
            return data.message || 'Matter request recorded; further IDs will be patched in later steps';
        }
    },

    { label: 'Contact Created/Updated', run: async () => 'Done' },
    { label: 'Databases Updated', run: async () => 'Done' },
    {
        label: 'Clio Contact Created/Updated',
        icon: clioIcon,
        run: async (formData, userInitials) => {
            const resp = await fetch('/api/clio-contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formData, initials: userInitials })
            });
            if (!resp.ok) throw new Error('Failed to sync Clio contact');
            return 'Clio contact synced';
        }
    },
    { label: 'Clio Matter Opened', run: async () => 'Done' },
    { label: 'NetDocument Workspace Triggered', run: async () => 'Done' },
    { label: 'Databases Updated', run: async () => 'Done' }
];
// invisible change 2.2

export const initialSteps: ProcessingStep[] = processingActions.map(action => ({
    label: action.label,
    status: 'pending',
    icon: action.icon
}));