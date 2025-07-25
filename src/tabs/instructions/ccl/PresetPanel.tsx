import React from 'react';
import { colours } from '../../../app/styles/colours';

interface PresetPanelProps {
    show: boolean;
    field: string | null;
    position: { x: number; y: number };
    presets: Record<string, string[]>;
    onSelect: (preset: string) => void;
    onClose: () => void;
}

const PresetPanel: React.FC<PresetPanelProps> = ({
    show,
    field,
    position,
    presets,
    onSelect,
    onClose
}) => {
    if (!show || !field) return null;

    const options = presets[field] || [];
    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    zIndex: 1000
                }}
                onClick={onClose}
            />
            <div
                style={{
                    position: 'fixed',
                    left: Math.min(position.x - 150, window.innerWidth - 320),
                    top: Math.min(position.y, window.innerHeight - 300),
                    width: '300px',
                    maxHeight: '280px',
                    backgroundColor: '#fff',
                    border: '1px solid #e1e5e9',
                    borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                    zIndex: 1001,
                    overflow: 'hidden'
                }}
            >
                <div
                    style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #e1e5e9',
                        backgroundColor: '#f8f9fa',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>
                        Choose Preset for {field.replace(/_/g, ' ')}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '16px',
                            cursor: 'pointer',
                            color: '#666',
                            padding: '2px'
                        }}
                    >
                        ×
                    </button>
                </div>
                <div
                    style={{
                        maxHeight: '220px',
                        overflowY: 'auto',
                        padding: '8px'
                    }}
                >
                    {options.map((preset, index) => (
                        <div
                            key={index}
                            onClick={() => onSelect(preset)}
                            style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: '#333',
                                backgroundColor: 'transparent',
                                border: '1px solid #e1e5e9',
                                margin: '4px 0',
                                transition: 'all 0.2s ease',
                                lineHeight: '1.3'
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = '#f8f9fa';
                                (e.currentTarget as HTMLElement).style.borderColor = colours.cta;
                                (e.currentTarget as HTMLElement).style.color = colours.cta;
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                                (e.currentTarget as HTMLElement).style.borderColor = '#e1e5e9';
                                (e.currentTarget as HTMLElement).style.color = '#333';
                            }}
                        >
                            {preset}
                        </div>
                    ))}
                    <div
                        onClick={onClose}
                        style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            fontSize: '13px',
                            color: '#666',
                            backgroundColor: 'transparent',
                            border: '1px dashed #ccc',
                            transition: 'all 0.2s ease',
                            margin: '8px 0 2px 0',
                            textAlign: 'center',
                            fontStyle: 'italic'
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = '#f8f9fa';
                            (e.currentTarget as HTMLElement).style.borderColor = '#999';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                            (e.currentTarget as HTMLElement).style.borderColor = '#ccc';
                        }}
                    >
                        Type my own...
                    </div>
                </div>
            </div>
        </>
    );
};

export default PresetPanel;
