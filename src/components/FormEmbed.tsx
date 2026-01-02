import React, { useEffect, useRef, useState, useCallback } from 'react';
// invisible change 2
import { MessageBar, MessageBarType, TooltipHost } from '@fluentui/react';
import { FormItem, UserData, NormalizedMatter, TeamData } from '../app/functionality/types';
import BespokeForm from '../CustomForms/BespokeForms';
import loaderIcon from '../assets/grey helix mark.png';
import { getProxyBaseUrl } from "../utils/getProxyBaseUrl";
import { useTheme } from '../app/functionality/ThemeContext';
import { getFormModeToggleStyles } from '../CustomForms/shared/formStyles';

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
    const formContainerRef = useRef<HTMLDivElement>(null);
    const [isCognitoLoaded, setIsCognitoLoaded] = useState<boolean>(false);
    const [formKey, setFormKey] = useState<number>(() => Date.now());
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);

    const loadCognitoScript = useCallback(() => {
        if (document.getElementById('cognito-forms-script')) {
            setIsCognitoLoaded(true);
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.id = 'cognito-forms-script';
            script.src = 'https://www.cognitoforms.com/f/seamless.js';
            script.async = true;
            script.onload = () => {
                setIsCognitoLoaded(true);
                resolve();
            };
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }, []);

    useEffect(() => {
        if (link.embedScript) {
            loadCognitoScript().catch((err) => console.error(err));
        }
    }, [link.embedScript, loadCognitoScript]);

    useEffect(() => {
        if (isCognitoLoaded && link.embedScript && formContainerRef.current) {
            formContainerRef.current.innerHTML = '';
            const formScript = document.createElement('script');
            formScript.src = 'https://www.cognitoforms.com/f/seamless.js';
            formScript.async = true;
            formScript.setAttribute('data-key', link.embedScript.key);
            formScript.setAttribute('data-form', link.embedScript.formId);
            formContainerRef.current.appendChild(formScript);
        }
    }, [isCognitoLoaded, link.embedScript]);

    const handleFinancialSubmit = useCallback(
        async (values: any) => {
            if (isSubmitting) return;
            setIsSubmitting(true);
            const payload = {
                formType: link.title,
                data: values,
                initials: userData?.[0]?.Initials || 'N/A',
            };
            
            // Debug logging for file uploads
            console.log('Form submission payload:', payload);
            if (values['Disbursement Upload']) {
                console.log('Disbursement Upload data:', values['Disbursement Upload']);
            }
            
            const endpointUrl = '/api/financial-task';
            try {
                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!response.ok) {
                    const errText = await response.text();
                    console.error('Error posting financial task:', errText);
                    setSubmissionSuccess(null);
                } else {
                    await response.json();
                    setSubmissionSuccess('Financial form submitted successfully!');
                    setTimeout(() => {
                        setSubmissionSuccess(null);
                        setFormKey(Date.now());
                    }, 3000);
                }

                if (link.title === 'Payment Requests') {
                    try {
                        await fetch(
                            'https://prod-16.uksouth.logic.azure.com:443/workflows/625f5ed1d19b42999e113bd44c4799e5/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=OQhUuEJuXMgy2UCbOAuwM-3OBKb0xLIKgbp1GcnH_Bg',
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(values),
                            }
                        );
                    } catch (err) {
                        console.error('Error posting payment request to external endpoint:', err);
                    }
                }
            } catch (error: any) {
                console.error('Error in financial form submission:', error);
                setSubmissionSuccess(null);
            } finally {
                setIsSubmitting(false);
            }
        },
        [link.title, userData, isSubmitting]
    );

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
                    {/* Form Mode Toggle - Cognito/Bespoke */}
                    <div style={getFormModeToggleStyles(isDarkMode).container}>
                        <button 
                            style={getFormModeToggleStyles(isDarkMode).option(true, false)}
                            aria-pressed="true"
                        >
                            Cognito
                        </button>
                        <TooltipHost content="Bespoke version coming soon">
                            <button 
                                style={getFormModeToggleStyles(isDarkMode).option(false, true)}
                                disabled
                                aria-pressed="false"
                            >
                                Bespoke
                            </button>
                        </TooltipHost>
                    </div>
                    <div ref={formContainerRef}>
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