import React from 'react';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import '../../../app/styles/ProcessingSection.css';
// invisible change 2.2

export type ProcessingStatus = 'pending' | 'success' | 'error';

export interface ProcessingStep {
    label: string;
    status: ProcessingStatus;
    message?: string;
    icon?: string;
}

interface ProcessingSectionProps {
    steps: ProcessingStep[];
    logs: string[];
    open: boolean;
}

const iconForStatus = (status: ProcessingStatus) => {
    switch (status) {
        case 'success':
            return <span aria-hidden="true">✔️</span>;
        case 'error':
            return <span aria-hidden="true">❌</span>;
        default:
            return <Spinner size={SpinnerSize.small} />;
    }
};

const OperationRow: React.FC<{ step: ProcessingStep }> = ({ step }) => (
    <li className={`step-${step.status}`}>
        {step.icon && (
            <img
                src={step.icon}
                alt=""
                className={`operation-icon ${step.status}`}
            />
        )}
        {iconForStatus(step.status)}
        <span className="label">{step.label}</span>
        {step.message && <span className="message">{step.message}</span>}
    </li>
);

const ProcessingSection: React.FC<ProcessingSectionProps> = ({ steps, logs, open }) => (
    <div className={`processing-collapsible ${open ? 'open' : ''}`}>
        <div className="processing-section">
            <h3>Processing actions</h3>
            <ul className="processing-steps">
                {steps.map((s, idx) => (
                    <OperationRow key={idx} step={s} />
                ))}
            </ul>
            {logs.length > 0 && (
                <pre className="processing-logs">{logs.join('\n')}</pre>
            )}
        </div>
    </div>
);

export default ProcessingSection;