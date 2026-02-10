import React from 'react'; // invisible change // invisible change
// invisible change 2.2
import {
    Stack,
    Text,
    PrimaryButton,
    mergeStyles,
    TextField,
} from '@fluentui/react';
import { sharedPrimaryButtonStyles } from '../../../app/styles/ButtonStyles';
import { colours } from '../../../app/styles/colours';
import '../../../app/styles/MultiSelect.css';
import ModernMultiSelect from './ModernMultiSelect';
import { useTheme } from '../../../app/functionality/ThemeContext';

interface ClientInfoStepProps {
    selectedDate: Date | null;
    setSelectedDate: (d: Date) => void;
    teamMember: string;
    setTeamMember: (s: string) => void;
    teamMemberOptions: string[];
    supervisingPartner: string;
    setSupervisingPartner: (s: string) => void;
    originatingSolicitor: string;
    setOriginatingSolicitor: (s: string) => void;
    isDateCalloutOpen: boolean;
    setIsDateCalloutOpen: (v: boolean) => void;
    dateButtonRef: React.RefObject<HTMLDivElement>;
    partnerOptions: string[];
    /** Options for Responsible/Originating Solicitor (active solicitors/partners) */
    solicitorOptions: string[];
    requestingUser: string;
    requestingUserClioId: string;
    onContinue?: () => void;
}

const ClientInfoStep: React.FC<ClientInfoStepProps> = ({
    selectedDate,
    setSelectedDate,
    teamMember,
    setTeamMember,
    teamMemberOptions,
    supervisingPartner,
    setSupervisingPartner,
    originatingSolicitor,
    setOriginatingSolicitor,
    isDateCalloutOpen,
    setIsDateCalloutOpen,
    dateButtonRef,
    partnerOptions,
    solicitorOptions,
    requestingUser,
    requestingUserClioId,
    onContinue,
}) => {
    const { isDarkMode } = useTheme();

    // Auto-pre-select Responsible Solicitor from requesting user if not already set
    React.useEffect(() => {
        if (!teamMember && requestingUser && solicitorOptions.includes(requestingUser)) {
            setTeamMember(requestingUser);
        }
    }, [requestingUser, solicitorOptions]);
    
    // Use consistent theming like other components
    const themeColours = {
        bg: isDarkMode ? '#0F172A' : '#FFFFFF',
        border: isDarkMode ? '#334155' : '#E2E8F0',
        text: isDarkMode ? '#E5E7EB' : '#0F172A',
        shadow: 'none',
        iconColor: colours.highlight, // Use standard highlight color like other components
        focusColor: colours.highlight,
        fieldBg: isDarkMode ? '#111827' : '#ffffff',
        selectedBg: isDarkMode ? '#1F2937' : `${colours.highlight}15`,
        textSecondary: isDarkMode ? '#9CA3AF' : colours.greyText
    };

    const separatorStyle = mergeStyles({
        height: '1px',
        backgroundColor: themeColours.border,
        margin: '0.5rem 0',
    });

    // Live time state
    const [liveTime, setLiveTime] = React.useState<string>(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' } as any)
    );
    React.useEffect(() => {
        const interval = setInterval(
            () => setLiveTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' } as any)),
            15000
        );
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            background: themeColours.bg,
            border: `1px solid ${themeColours.border}`,
            borderRadius: 2,
            padding: 20,
            boxShadow: themeColours.shadow,
            boxSizing: 'border-box'
        }}>
            <Stack tokens={{ childrenGap: 8 }}>
                {/* Section Header */}
                <div style={{ marginBottom: 4 }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 6,
                    }}>
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: 0,
                            background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
                            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <i className="ms-Icon ms-Icon--Teamwork" style={{ fontSize: 14, color: colours.highlight }} />
                        </div>
                        <div>
                            <div style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: isDarkMode ? '#E5E7EB' : '#0F172A',
                            }}>
                                Team Assignments
                            </div>
                            <div style={{
                                fontSize: 12,
                                color: isDarkMode ? '#9CA3AF' : '#64748B',
                            }}>
                                Who is responsible for this matter
                            </div>
                        </div>
                    </div>
                </div>

                {/* Responsible Solicitor / Originating Solicitor */}
                <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <i className="ms-Icon ms-Icon--ContactInfo" style={{ fontSize: 14, color: themeColours.iconColor }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: themeColours.text }}>Responsible Solicitor</span>
                        </div>
                        <div style={{ fontSize: 12, color: themeColours.textSecondary, marginBottom: 6, paddingLeft: 22 }}>
                            Day-to-day management of this matter
                        </div>
                        <div
                            style={{
                                position: 'relative',
                                width: '100%',
                                height: '40px',
                                border: `1px solid ${teamMember ? themeColours.focusColor : themeColours.border}`,
                                borderRadius: 0,
                                background: teamMember
                                    ? themeColours.selectedBg
                                    : themeColours.fieldBg,
                                overflow: 'hidden',
                            }}
                        >
                            <select
                                value={teamMember}
                                onChange={(e) => setTeamMember(e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0 40px 0 16px',
                                    fontSize: '13px',
                                    color: teamMember ? themeColours.focusColor : themeColours.textSecondary,
                                    fontWeight: '400',
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="" disabled>
                                    Select Responsible Solicitor
                                </option>
                                {solicitorOptions.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                            <div
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    pointerEvents: 'none',
                                    color: teamMember ? themeColours.focusColor : themeColours.textSecondary,
                                }}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                >
                                    <path
                                        d="M6 9l6 6 6-6"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <i className="ms-Icon ms-Icon--AddFriend" style={{ fontSize: 14, color: themeColours.iconColor }} />
                            <span style={{ fontSize: 14, fontWeight: 600, color: themeColours.text }}>Originating Solicitor</span>
                        </div>
                        <div style={{ fontSize: 12, color: themeColours.textSecondary, marginBottom: 6, paddingLeft: 22 }}>
                            Who introduced this client to the firm
                        </div>
                        <div
                            style={{
                                position: 'relative',
                                width: '100%',
                                height: '40px',
                                border: `1px solid ${originatingSolicitor ? themeColours.focusColor : themeColours.border}`,
                                borderRadius: 0,
                                background: originatingSolicitor
                                    ? themeColours.selectedBg
                                    : themeColours.fieldBg,
                                overflow: 'hidden',
                            }}
                        >
                            <select
                                value={originatingSolicitor}
                                onChange={(e) =>
                                    setOriginatingSolicitor(e.target.value)
                                }
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0 40px 0 16px',
                                    fontSize: '13px',
                                    color: originatingSolicitor ? themeColours.focusColor : themeColours.textSecondary,
                                    fontWeight: '400',
                                    appearance: 'none',
                                    cursor: 'pointer',
                                    outline: 'none',
                                }}
                            >
                                <option value="" disabled>
                                    Select Originating Solicitor
                                </option>
                                {solicitorOptions.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                            <div
                                style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    pointerEvents: 'none',
                                    color: originatingSolicitor
                                        ? themeColours.focusColor
                                        : themeColours.textSecondary,
                                }}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                >
                                    <path
                                        d="M6 9l6 6 6-6"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Supervising Partner */}
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <i className="ms-Icon ms-Icon--AuthenticatorApp" style={{ fontSize: 14, color: themeColours.iconColor }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: themeColours.text }}>Supervising Partner</span>
                    </div>
                    <div style={{ fontSize: 12, color: themeColours.textSecondary, marginBottom: 6, paddingLeft: 22 }}>
                        Oversight and quality assurance
                    </div>
                    <ModernMultiSelect
                        label=""
                        options={partnerOptions.map((name) => ({
                            key: name,
                            text: name,
                        }))}
                        selectedValue={supervisingPartner}
                        onSelectionChange={setSupervisingPartner}
                        variant="grid"
                    />
                </div>

                {onContinue && (
                    <PrimaryButton
                        text="Continue"
                        onClick={onContinue}
                        styles={sharedPrimaryButtonStyles}
                    />
                )}
            </Stack>

            <style>{``}</style>
        </div>
    );
};

export default ClientInfoStep;
