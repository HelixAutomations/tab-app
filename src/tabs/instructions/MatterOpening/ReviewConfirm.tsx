//
import React, { useState, useEffect } from 'react'; // invisible change
// invisible change 2.2
import '../../../app/styles/ReviewConfirm.css';
import { useCompletion } from './CompletionContext';
import ProcessingSection, { ProcessingStep, ProcessingStatus } from './ProcessingSection';
import { processingActions, initialSteps, registerMatterIdCallback } from './processingActions';
import { UserData } from '../../../app/functionality/types';
import ModernMultiSelect from './ModernMultiSelect';

interface ReviewConfirmProps {
    detailsConfirmed: boolean;
    formData: Record<string, any>;
    userInitials: string;
    userData?: UserData[] | null;
    onConfirmed?: () => void;
    /** Optional instruction reference so DocumentsV3 can load context */
    instructionRef?: string;
}

const AccordionSection: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
    const [open, setOpen] = React.useState(defaultOpen);
    const id = title.replace(/\s+/g, '-').toLowerCase();
    return (
        <div className="accordion-wrap">
            <div
                className="accordion-header question-banner"
                onClick={() => setOpen((o) => !o)}
                tabIndex={0}
                aria-expanded={open}
                aria-controls={id}
            >
                {title}
                <span className="accordion-toggle">{open ? '−' : '+'}</span>
            </div>
            <div id={id} className={`accordion-body ${open ? 'open' : 'collapsed'}`} aria-hidden={!open}>
                {children}
            </div>
        </div>
    );
};

const ReviewConfirm: React.FC<ReviewConfirmProps> = ({ detailsConfirmed, formData, userInitials, userData, onConfirmed, instructionRef }) => {
    const { summaryComplete, setSummaryComplete } = useCompletion();

    const [processing, setProcessing] = useState(false);
    const [steps, setSteps] = useState<ProcessingStep[]>(initialSteps);
    const [logs, setLogs] = useState<string[]>([]);
    const [draftChoice, setDraftChoice] = useState<'yes' | 'no' | null>(null);
    const [openedMatterId, setOpenedMatterId] = useState<string | null>(null);

    const updateStep = (index: number, status: ProcessingStatus, message: string) => {
        setSteps(prev => prev.map((s, i) => (i === index ? { ...s, status, message } : s)));
        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    };

    useEffect(() => {
        registerMatterIdCallback(setOpenedMatterId);
        return () => registerMatterIdCallback(null);
    }, []);

    const handleSubmit = async () => {
        setProcessing(true);
        setLogs([]);
        setSteps(initialSteps);

        let currentIndex = 0;
        try {
            for (currentIndex = 0; currentIndex < processingActions.length; currentIndex++) {
                const action = processingActions[currentIndex];
                updateStep(currentIndex, 'pending', `${action.label}...`);
                const result = await action.run(formData, userInitials, userData);
                const message = typeof result === 'string' ? result : result.message;
                updateStep(currentIndex, 'success', message);
            }

            setSummaryComplete(true);
            if (onConfirmed) onConfirmed();
        } catch (err) {
            // Only mark as error if we are still within the steps
            if (currentIndex < processingActions.length) {
                updateStep(currentIndex, 'error', `Error: ${err}`);
            } else {
                // All steps completed, error happened after
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Unexpected error after all steps: ${err}`]);
            }
            console.error('❌ Matter submit failed', err);
        } finally {
            setProcessing(false);
        }
    };

    const handleDraftChoice = (choice: 'yes' | 'no') => {
        setDraftChoice(choice);
    };

    return (
        <div className="next-steps-content">
            {!processing && !summaryComplete && (
                <div className="declaration-section no-border">
                    <div className="review-actions">
                        <button className="cta-declare-btn" disabled={!detailsConfirmed} onClick={handleSubmit}>
                            Open Matter
                        </button>
                    </div>
                </div>
            )}

            <ProcessingSection open={true} steps={steps} logs={logs} />

            {summaryComplete && !processing && draftChoice === null && (
                <div style={{ marginTop: 16 }}>
                    <ModernMultiSelect
                        label="Draft the CCL now?"
                        options={[
                            { key: 'yes', text: 'Yes, draft now' },
                            { key: 'no', text: 'Not now' }
                        ]}
                        selectedValue={draftChoice}
                        onSelectionChange={(val) => handleDraftChoice(val as 'yes' | 'no')}
                        variant="binary"
                    />
                </div>
            )}
        </div>
    );
};

export default ReviewConfirm;
