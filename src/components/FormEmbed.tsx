import React from 'react';
// invisible change 2
import { MessageBar, MessageBarType } from '@fluentui/react/lib/MessageBar';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { FormItem, UserData, NormalizedMatter, TeamData } from '../app/functionality/types';
import BespokeForm from '../CustomForms/BespokeForms';
import loaderIcon from '../assets/grey helix mark.png';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { isDevOwner } from '../app/admin';
import { getFormModeToggleStyles } from '../CustomForms/shared/formStyles';
import { useCognitoEmbed } from '../hooks/useCognitoEmbed';
import { useFinancialFormSubmit } from '../hooks/useFinancialFormSubmit';
import { checkIsLocalDev } from '../utils/useIsLocalDev';

interface FormEmbedProps {
    link: FormItem;
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    matters: NormalizedMatter[];
}

const loaderStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
};

const FormEmbed: React.FC<FormEmbedProps> = ({ link, userData, teamData, matters }) => {
    const { isDarkMode } = useTheme();
    const showFormModeToggle = isDevOwner(userData?.[0] || null) && checkIsLocalDev();
    const { containerRef: formContainerRef, isCognitoLoaded, cognitoError } = useCognitoEmbed({
        embedScript: link.embedScript,
        isActive: Boolean(link.embedScript),
    });
    const {
        formKey,
        isSubmitting,
        submissionSuccess,
        setSubmissionSuccess,
        handleFinancialSubmit,
    } = useFinancialFormSubmit({
        formType: link.title,
        initials: userData?.[0]?.Initials,
    });

    return (
        <div style={{ padding: '10px 0' }}>
            {submissionSuccess && (
                <MessageBar
                    messageBarType={MessageBarType.success}
                    isMultiline={false}
                    onDismiss={() => setSubmissionSuccess(null)}
                    dismissButtonAriaLabel="Close"
                    styles={{ root: { marginBottom: '10px', borderRadius: '4px' } }}
                >
                    {submissionSuccess}
                </MessageBar>
            )}
            {link.embedScript ? (
                <>
                    {showFormModeToggle && (
                        <>
                            <div style={{ display: 'grid', gap: 6, marginBottom: '10px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: isDarkMode ? colours.accent : colours.highlight }}>
                                    Luke-only dev preview
                                </div>
                                <div style={getFormModeToggleStyles(isDarkMode).container}>
                                    <button 
                                        style={getFormModeToggleStyles(isDarkMode).option(true, false)}
                                        aria-pressed="true"
                                    >
                                        Cognito
                                    </button>
                                    <TooltipHost content="Luke-only bespoke preview">
                                        <button 
                                            style={getFormModeToggleStyles(isDarkMode).option(false, true)}
                                            disabled
                                            aria-pressed="false"
                                        >
                                            Bespoke
                                        </button>
                                    </TooltipHost>
                                </div>
                            </div>
                        </>
                    )}
                    <div ref={formContainerRef}>
                        {cognitoError && <div>{cognitoError}</div>}
                        {!isCognitoLoaded && (
                            <div style={loaderStyle}>
                                <img src={loaderIcon} alt="Loading..." style={{ width: '100px', height: 'auto' }} />
                            </div>
                        )}
                    </div>
                </>
            ) : link.fields ? (
                <BespokeForm
                    key={formKey}
                    fields={link.fields.map((f) => ({ ...f, name: f.label }))}
                    onSubmit={handleFinancialSubmit}
                    onCancel={() => { }}
                    isSubmitting={isSubmitting}
                    matters={matters}
                />
                ) : link.component ? (
                    React.createElement(link.component, {
                        users: userData || [],
                        userData: userData || [],
                        teamData,
                        matters,
                        onBack: () => { }
                    })
            ) : (
                <div>No form available for this item.</div>
            )}
        </div>
    );
};

export default FormEmbed;