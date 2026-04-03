import React from 'react';
import { colours } from '../../app/styles/colours';
import { CommandCentreTokens } from './types';

interface WorkspaceViewsSectionProps {
    tokens: CommandCentreTokens;
    featureToggles: Record<string, boolean>;
    onFeatureToggle?: (feature: string, enabled: boolean) => void;
    demoModeEnabled?: boolean;
    onToggleDemoMode?: (enabled: boolean) => void;
    closePopover: () => void;
}

const WorkspaceViewsSection: React.FC<WorkspaceViewsSectionProps> = ({
    tokens,
    featureToggles,
    onFeatureToggle,
    demoModeEnabled = false,
    onToggleDemoMode,
    closePopover,
}) => {
    const { isDarkMode, textMuted, borderLight, actionBtn, showToast } = tokens;

    const openHome = () => {
        window.dispatchEvent(new CustomEvent('navigateToHome'));
        closePopover();
    };

    const handleDemoView = () => {
        const next = !demoModeEnabled;
        onToggleDemoMode?.(next);
        showToast(next ? 'Demo mode on' : 'Demo mode off', 'success');
        if (next) openHome();
    };

    const handleProdView = () => {
        const next = !featureToggles.viewAsProd;
        onFeatureToggle?.('viewAsProd', next);
        showToast(next ? 'Production view on' : 'Production view off', 'success');
        if (next) openHome();
    };

    return (
        <div style={{ marginBottom: 4 }}>
            <div style={{
                background: isDarkMode ? colours.darkBlue : colours.grey,
                border: `1px solid ${borderLight}`,
                borderRadius: 0,
                padding: '10px 14px',
                display: 'grid',
                gap: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textMuted }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: isDarkMode ? colours.accent : colours.highlight }} />
                    Workspace views
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button
                        onClick={handleDemoView}
                        style={{
                            ...actionBtn,
                            justifyContent: 'center',
                            color: demoModeEnabled ? '#fff' : actionBtn.color,
                            background: demoModeEnabled ? colours.green : actionBtn.background,
                            border: demoModeEnabled ? `1px solid ${colours.green}` : actionBtn.border,
                        }}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20" /><path d="M2 12h20" /></svg>
                        {demoModeEnabled ? 'Demo On' : 'Demo View'}
                    </button>
                    <button
                        onClick={handleProdView}
                        style={{
                            ...actionBtn,
                            justifyContent: 'center',
                            color: featureToggles.viewAsProd ? '#fff' : actionBtn.color,
                            background: featureToggles.viewAsProd ? colours.cta : actionBtn.background,
                            border: featureToggles.viewAsProd ? `1px solid ${colours.cta}` : actionBtn.border,
                        }}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18" /><path d="M12 3v18" /><circle cx="12" cy="12" r="9" /></svg>
                        {featureToggles.viewAsProd ? 'Prod On' : 'Prod View'}
                    </button>
                </div>

                <div style={{ fontSize: 10, color: textMuted, lineHeight: 1.4 }}>
                    Demo and production shortcuts open Home against the real matter flow without a separate preview mode.
                </div>
                </div>
            </div>
        </div>
    );
};

export default WorkspaceViewsSection;