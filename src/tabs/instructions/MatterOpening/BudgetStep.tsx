import React from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { TextField } from '@fluentui/react/lib/TextField';
import ModernMultiSelect from './ModernMultiSelect';
import { colours } from '../../../app/styles/colours';

// Shared light/dark aware colours (fallbacks if global theme not injected)
const light = {
    bg: 'linear-gradient(135deg,#FFFFFF 0%,#F8FAFC 100%)',
    panel: '#FFFFFF',
    border: '#E2E8F0',
    label: '#334155',
    text: '#0F172A',
    subtle: colours.greyText,
    focus: colours.highlight,
};
const dark = {
    bg: 'linear-gradient(135deg,#1E293B 0%,#0F172A 100%)',
    panel: '#1E293B',
    border: '#334155',
    label: '#CBD5E1',
    text: '#F1F5F9',
    subtle: '#94A3B8',
    focus: colours.highlight,
};

function useColourMode() {
    if (typeof document === 'undefined') return { isDark:false, c: light };
    const darkMode = document.documentElement.classList.contains('dark');
    return { isDark: darkMode, c: darkMode ? dark : light };
}

interface BudgetStepProps {
    budgetRequired: string;
    setBudgetRequired: (v: string) => void;
    budgetAmount: string;
    setBudgetAmount: (v: string) => void;
    threshold: string;
    setThreshold: (v: string) => void;
    notifyUsers: string;
    setNotifyUsers: (v: string) => void;
}

const BudgetStep: React.FC<BudgetStepProps> = ({
    budgetRequired,
    setBudgetRequired,
    budgetAmount,
    setBudgetAmount,
    threshold,
    setThreshold,
    notifyUsers,
    setNotifyUsers
}) => {
    // Call hook first (must not be conditional)
    const { c } = useColourMode();
    // Local-only visibility guard: hide entirely in hosted/prod environments
    const isLocal = (typeof window !== 'undefined') && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isLocal) return null; // Hidden in production
    const fieldStyle: React.CSSProperties = {
        background: c.panel,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        boxShadow: c === light ? '0 4px 6px rgba(0,0,0,0.07)' : '0 4px 6px rgba(0,0,0,0.3)',
        padding: '14px 16px',
        position: 'relative'
    };
    const labelStyle: React.CSSProperties = {
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '.5px',
        textTransform: 'uppercase',
        color: c.label,
        marginBottom: 6,
    };
    const inlineRow: React.CSSProperties = {
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap'
    };
    return (
        <div style={{ display:'flex', flexDirection:'column', gap:16, background:c.bg, padding:16, borderRadius:12, border:`1px solid ${c.border}`, position:'relative' }}>
            <div style={{position:'absolute', top:4, right:8, background:'#DB2777', color:'#FFF', fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:6, letterSpacing:'.5px', boxShadow:'0 2px 4px rgba(0,0,0,0.15)'}}>LOCAL ONLY</div>
            <div style={fieldStyle}>
                <div style={labelStyle}>Matter Budget Required?</div>
                <ModernMultiSelect
                    label={''}
                    options={[{ key: 'Yes', text: 'Yes' }, { key: 'No', text: 'No' }]}
                    selectedValue={budgetRequired}
                    onSelectionChange={setBudgetRequired}
                    variant="default"
                />
            </div>
            {budgetRequired === 'Yes' && (
                <div style={inlineRow}>
                    <div style={{ ...fieldStyle, flex: '1 1 180px' }}>
                        <div style={labelStyle}>Budget Amount</div>
                        <TextField
                            styles={{ fieldGroup:{ border:'none', background:'transparent' }, field:{ fontWeight:600 } }}
                            prefix="£"
                            value={budgetAmount}
                            onChange={(_, v) => setBudgetAmount(v || '')}
                        />
                    </div>
                    <div style={{ ...fieldStyle, flex: '1 1 160px' }}>
                        <div style={labelStyle}>Notify At</div>
                        <TextField
                            styles={{ fieldGroup:{ border:'none', background:'transparent' }, field:{ fontWeight:600 } }}
                            suffix="%"
                            value={threshold}
                            onChange={(_, v) => setThreshold(v || '')}
                        />
                    </div>
                    <div style={{ ...fieldStyle, flex: '2 1 260px' }}>
                        <div style={labelStyle}>Notify Users</div>
                        <TextField
                            styles={{ fieldGroup:{ border:'none', background:'transparent' } }}
                            placeholder="emails separated by commas"
                            value={notifyUsers}
                            onChange={(_, v) => setNotifyUsers(v || '')}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default BudgetStep;

