import React, { useState } from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';

export interface InstructionSummary {
    id: string;
    clientName: string;
    service: string;
    nextAction: string;
    disabled?: boolean; // For greyed out production features
}

interface InstructionsPromptProps {
    summaries: InstructionSummary[];
    onDismiss: () => void;
}

const InstructionsPrompt: React.FC<InstructionsPromptProps> = ({ summaries, onDismiss }) => {
    const [expanded, setExpanded] = useState(false);
    if (summaries.length === 0) return null;
    return (
        <div className="instructions-prompt" style={{ padding: 16, border: '1px solid #e1dfdd', marginBottom: 16 }}>
            <p>You’ve received {summaries.length} instruction{summaries.length > 1 ? 's' : ''}. Your next step is required.</p>
            <ul style={{ marginTop: 8, marginBottom: 8 }}>
                {summaries.map(s => (
                    <li key={s.id}>{s.clientName} – {s.service} – Next: {s.nextAction}</li>
                ))}
            </ul>
            {expanded && (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 8 }}>
                    {JSON.stringify(summaries, null, 2)}
                </pre>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
                <DefaultButton onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide Details' : 'View Details'}</DefaultButton>
                <DefaultButton onClick={onDismiss}>Dismiss</DefaultButton>
            </div>
        </div>
    );
};

export default InstructionsPrompt;
