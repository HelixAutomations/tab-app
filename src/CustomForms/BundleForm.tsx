import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { TextField } from '@fluentui/react/lib/TextField';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Dropdown } from '@fluentui/react/lib/Dropdown';
import type { IDropdownOption } from '@fluentui/react/lib/Dropdown';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import type { IButtonStyles } from '@fluentui/react/lib/Button';
import { Label } from '@fluentui/react/lib/Label';
import { Icon } from '@fluentui/react/lib/Icon';
import { UserData, NormalizedMatter } from '../app/functionality/types';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import {
    getFormContainerStyle,
    getFormScrollContainerStyle,
    getFormCardStyle,
    getFormHeaderStyle,
    getFormHeaderTitleStyle,
    getFormHeaderSubtitleStyle,
    getFormSectionStyle,
    getFormSectionHeaderStyle,
    getInputStyles,
    getDropdownStyles,
    getFormPrimaryButtonStyles,
    getFormDefaultButtonStyles,
    getFormLabelStyle,
    getFormHelperTextStyle,
    getFormSystemNoteStyle,
    getFormSystemNoteIconStyle,
    getFormSubmitFeedbackStyle,
    getFormSubmitFeedbackIconStyle,
    getFormTextareaStyles,
    formFont,
    formFieldTokens,
    formSectionTokens,
    formAccentColors,
} from './shared/formStyles';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CoverLetter {
    link: string;
    copies: number;
}

interface PostedRecipient {
    recipient: string;
    addressee: string;
    email: string;
}

interface BundleFormProps {
    users?: UserData[];
    matters: NormalizedMatter[];
    onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const BundleForm: React.FC<BundleFormProps> = ({ users = [], matters, onBack }) => {
    const { isDarkMode } = useTheme();
    const accentColor = formAccentColors.bundle;

    // ─────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────

    const [name, setName] = useState<string>(
        users.length > 0 
            ? users[0].FullName || users[0].Nickname || users[0].Initials || 'Current User' 
            : 'Current User'
    );
    const [matterRef, setMatterRef] = useState<string>('');
    const [bundleLink, setBundleLink] = useState<string>('');
    const [posted, setPosted] = useState<string[]>([]);
    const [postedRecipients, setPostedRecipients] = useState<PostedRecipient[]>([]);
    const [leftInOffice, setLeftInOffice] = useState<boolean>(false);
    const [arrivalDate, setArrivalDate] = useState<Date | null>(null);
    const [officeDate, setOfficeDate] = useState<Date | null>(null);
    const [coverLetter, setCoverLetter] = useState<CoverLetter>({ link: '', copies: 1 });
    const [copiesInOffice, setCopiesInOffice] = useState<number>(1);
    const [notes, setNotes] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [submitMessage, setSubmitMessage] = useState<string>('');

    // Matter search state
    const [matterSearchTerm, setMatterSearchTerm] = useState(matterRef || '');
    const [matterDropdownOpen, setMatterDropdownOpen] = useState(false);
    const [selectedMatter, setSelectedMatter] = useState<any>(null);
    const matterFieldRef = useRef<HTMLDivElement>(null);

    // ─────────────────────────────────────────────────────────────────────────
    // STYLES
    // ─────────────────────────────────────────────────────────────────────────

    const containerStyle = getFormContainerStyle(isDarkMode);
    const scrollContainerStyle = getFormScrollContainerStyle(isDarkMode);
    const cardStyle = getFormCardStyle(isDarkMode);
    const headerStyle = getFormHeaderStyle(isDarkMode, accentColor);
    const sectionStyle = getFormSectionStyle(isDarkMode);
    const sectionHeaderStyle = getFormSectionHeaderStyle(isDarkMode);
    const inputStyles = getInputStyles(isDarkMode);
    const dropdownStyles = getDropdownStyles(isDarkMode);
    const primaryButtonStyles = getFormPrimaryButtonStyles(isDarkMode, accentColor);
    const defaultButtonStyles = getFormDefaultButtonStyles(isDarkMode);

    const toggleButtonStyles = (checked: boolean): IButtonStyles => ({
        root: {
            height: 44,
            padding: '0 20px',
            borderRadius: 0,
            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            background: checked 
                ? accentColor 
                : isDarkMode ? 'rgba(6, 23, 51,0.5)' : '#ffffff',
            color: checked ? '#ffffff' : isDarkMode ? '#f3f4f6' : '#374151',
            fontWeight: 600,
            fontSize: '14px',
            transition: 'all 0.15s ease',
        },
        rootHovered: {
            background: checked 
                ? accentColor 
                : isDarkMode ? 'rgba(55, 65, 81,0.5)' : '#F4F4F6',
            color: checked ? '#ffffff' : isDarkMode ? '#f3f4f6' : '#374151',
        },
        rootChecked: {
            background: accentColor,
            color: '#ffffff',
        },
    });

    const branchCardStyle: React.CSSProperties = {
        background: isDarkMode ? 'rgba(6, 23, 51, 0.3)' : '#F4F4F6',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        borderLeft: `3px solid ${accentColor}`,
        padding: '16px 20px',
        marginTop: '16px',
    };

    const recipientRowStyle: React.CSSProperties = {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        background: isDarkMode ? 'rgba(6, 23, 51,0.5)' : '#ffffff',
        padding: '12px',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
        marginBottom: '8px',
    };

    const matterDropdownStyle: React.CSSProperties = {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 1000,
        background: isDarkMode ? '#061733' : '#ffffff',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        maxHeight: '300px',
        overflowY: 'auto',
        marginTop: '4px',
    };

    const matterOptionStyle: React.CSSProperties = {
        padding: '12px',
        cursor: 'pointer',
        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
        transition: 'background-color 0.15s ease',
    };

    // ─────────────────────────────────────────────────────────────────────────
    // MEMOS & CALLBACKS
    // ─────────────────────────────────────────────────────────────────────────

    const userOptions: IDropdownOption[] = useMemo(() => {
        return users.map(u => {
            const fullName = (u as any)["Full Name"] || u.FullName || `${u.First || ''} ${u.Last || ''}`.trim();
            const key = u.Initials || fullName;
            return { key, text: fullName };
        });
    }, [users]);

    useEffect(() => {
        if (matterRef && matterRef !== matterSearchTerm) {
            setMatterSearchTerm(matterRef);
        }
    }, [matterRef, matterSearchTerm]);

    const filteredMatters = useMemo(() => {
        if (!matters || matters.length === 0) return [];
        if (!matterSearchTerm.trim()) return matters.slice(0, 50);
        
        const searchLower = matterSearchTerm.toLowerCase();
        return matters.filter((matter: any) => {
            const displayNumber = matter["Display Number"] || matter.displayNumber || '';
            const clientName = matter["Client Name"] || matter.clientName || '';
            const description = matter["Description"] || matter.description || '';
            
            return displayNumber.toLowerCase().includes(searchLower) ||
                   clientName.toLowerCase().includes(searchLower) ||
                   description.toLowerCase().includes(searchLower);
        }).slice(0, 20);
    }, [matters, matterSearchTerm]);

    const handleMatterSelect = useCallback((matter: any) => {
        const displayNumber = matter["Display Number"] || matter.displayNumber || '';
        setSelectedMatter(matter);
        setMatterRef(displayNumber);
        setMatterSearchTerm(displayNumber);
        setMatterDropdownOpen(false);
    }, []);

    const handleMatterSearchChange = useCallback((value: string) => {
        setMatterSearchTerm(value);
        setMatterRef(value);
        setMatterDropdownOpen(value.length > 0);
        
        if (selectedMatter && value !== (selectedMatter["Display Number"] || selectedMatter.displayNumber)) {
            setSelectedMatter(null);
        }
    }, [selectedMatter]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (matterFieldRef.current && !matterFieldRef.current.contains(event.target as Node)) {
                setMatterDropdownOpen(false);
            }
        };

        if (matterDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [matterDropdownOpen]);

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION & SUBMIT
    // ─────────────────────────────────────────────────────────────────────────

    const isValid = () => {
        if (!name || !matterRef || !bundleLink) return false;
        if (posted.length === 0 && !leftInOffice) return false;
        if (posted.length > 0) {
            if (!arrivalDate) return false;
            if (!coverLetter.link || coverLetter.copies < 1) return false;
        }
        if (leftInOffice) {
            if (!officeDate || copiesInOffice < 1) return false;
        }
        return true;
    };

    const handleSubmit = async () => {
        if (!isValid()) return;
        
        setSubmitting(true);
        setSubmitStatus('submitting');
        setSubmitMessage('Creating Asana task...');
        
        const currentUser = users[0];

        const getAsanaField = (user: any, key: string) => {
            return (
                user[key] ||
                user[key.replace('ID', '_ID')] ||
                user[key.replace('ID', '_ID').toUpperCase()] ||
                user[key.replace('ID', '_Id')] ||
                user[key.replace('ID', '_Id').toUpperCase()]
            );
        };

        const payload: any = {
            name,
            matterReference: matterRef,
            bundleLink,
            deliveryOptions: {
                posted: posted,
                leftInOffice,
            },
            arrivalDate: posted.length > 0 ? arrivalDate?.toISOString() : null,
            officeReadyDate: leftInOffice ? officeDate?.toISOString() : null,
            coveringLetter: posted.length > 0 ? coverLetter : undefined,
            copiesInOffice: leftInOffice ? copiesInOffice : undefined,
            notes: notes || undefined,
        };

        if (currentUser) {
            payload.ASANAClientID = getAsanaField(currentUser, 'ASANAClientID');
            payload.ASANASecret = getAsanaField(currentUser, 'ASANASecret');
            payload.ASANARefreshToken = getAsanaField(currentUser, 'ASANARefreshToken');
        }

        try {
            const response = await fetch('/api/bundle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            
            if (response.ok) {
                setSubmitStatus('success');
                setSubmitMessage('Bundle task created successfully!');
                setTimeout(() => onBack(), 1500);
            } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                setSubmitStatus('error');
                setSubmitMessage(`Failed to create task: ${errorData.error || 'Unknown error'}`);
            }
        } catch (err) {
            console.error(err);
            setSubmitStatus('error');
            setSubmitMessage('Network error - please check your connection and try again');
        } finally {
            setSubmitting(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div style={containerStyle}>
            <div style={scrollContainerStyle}>
                <div style={cardStyle}>
                    {/* Header */}
                    <div style={headerStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <Icon 
                                iconName="Package" 
                                style={{ fontSize: '20px', color: accentColor }} 
                            />
                            <div>
                                <Text style={getFormHeaderTitleStyle(isDarkMode)}>
                                    Bundle Submission
                                </Text>
                                <Text style={getFormHeaderSubtitleStyle(isDarkMode)}>
                                    Prepare and route physical document bundles
                                </Text>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div style={{ padding: '24px' }}>
                        <Stack tokens={formSectionTokens}>
                            {/* Request Details Section */}
                            <div style={sectionStyle}>
                                <Text style={sectionHeaderStyle}>
                                    <Icon iconName="Contact" style={{ marginRight: '8px', color: accentColor }} />
                                    Request Details
                                </Text>
                                
                                <Stack tokens={formFieldTokens}>
                                    {/* Matter Reference Field */}
                                    <div ref={matterFieldRef} style={{ position: 'relative' }}>
                                        <Label style={getFormLabelStyle(isDarkMode)}>
                                            Matter reference *
                                        </Label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                type="text"
                                                value={matterSearchTerm}
                                                onChange={(e) => handleMatterSearchChange(e.target.value)}
                                                onFocus={() => setMatterDropdownOpen(true)}
                                                placeholder="Search by matter number or client name..."
                                                disabled={submitting}
                                                style={{
                                                    width: '100%',
                                                    height: '44px',
                                                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                                    outline: 'none',
                                                    background: isDarkMode ? 'rgba(6, 23, 51,0.5)' : '#ffffff',
                                                    fontFamily: formFont,
                                                    fontSize: '14px',
                                                    padding: '0 40px 0 12px',
                                                    color: 'var(--text-primary)',
                                                    cursor: submitting ? 'not-allowed' : 'text',
                                                    boxSizing: 'border-box',
                                                }}
                                                required
                                            />
                                            <Icon 
                                                iconName="ChevronDown" 
                                                style={{
                                                    position: 'absolute',
                                                    right: '12px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    fontSize: '14px',
                                                    color: isDarkMode ? '#A0A0A0' : '#6B6B6B',
                                                    pointerEvents: 'none',
                                                }} 
                                            />
                                        </div>
                                        
                                        {/* Matter Dropdown */}
                                        {matterDropdownOpen && filteredMatters.length > 0 && (
                                            <div style={matterDropdownStyle}>
                                                {filteredMatters.map((matter: any, index: number) => {
                                                    const displayNumber = matter["Display Number"] || matter.displayNumber || '';
                                                    const clientName = matter["Client Name"] || matter.clientName || '';
                                                    const description = matter["Description"] || matter.description || '';
                                                    
                                                    return (
                                                        <div
                                                            key={displayNumber + index}
                                                            onClick={() => handleMatterSelect(matter)}
                                                            style={matterOptionStyle}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.backgroundColor = isDarkMode 
                                                                    ? 'rgba(255,255,255,0.05)' 
                                                                    : 'rgba(0,0,0,0.03)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                            }}
                                                        >
                                                            <div style={{
                                                                fontWeight: 600,
                                                                fontSize: '14px',
                                                                fontFamily: formFont,
                                                                color: 'var(--text-primary)',
                                                                marginBottom: '2px',
                                                            }}>
                                                                {displayNumber}
                                                            </div>
                                                            <div style={{
                                                                fontSize: '13px',
                                                                color: 'var(--text-muted)',
                                                            }}>
                                                                {clientName}
                                                            </div>
                                                            {description && (
                                                                <div style={{
                                                                    fontSize: '12px',
                                                                    color: 'var(--text-muted)',
                                                                    opacity: 0.7,
                                                                }}>
                                                                    {description.length > 60 ? description.substring(0, 60) + '...' : description}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <TextField
                                        label="NetDocs link (bundle)"
                                        value={bundleLink}
                                        onChange={(_, v) => setBundleLink(v || '')}
                                        required
                                        disabled={submitting}
                                        styles={inputStyles}
                                        placeholder="Paste the NetDocs bundle link or reference"
                                    />
                                </Stack>
                            </div>

                            {/* Delivery Method Section */}
                            <div style={sectionStyle}>
                                <Text style={sectionHeaderStyle}>
                                    <Icon iconName="DeliveryTruck" style={{ marginRight: '8px', color: accentColor }} />
                                    Delivery Method
                                </Text>
                                
                                {/* Toggle Buttons */}
                                <Stack horizontal tokens={{ childrenGap: 12 }} style={{ marginBottom: '16px' }}>
                                    <DefaultButton
                                        text="Posted"
                                        checked={posted.length > 0}
                                        onClick={() => {
                                            if (posted.length > 0) {
                                                setPosted([]);
                                                setPostedRecipients([]);
                                            } else {
                                                setPostedRecipients([{ recipient: '', addressee: '', email: '' }]);
                                                setPosted(['']);
                                            }
                                        }}
                                        disabled={submitting}
                                        iconProps={{ iconName: 'Send' }}
                                        styles={toggleButtonStyles(posted.length > 0)}
                                    />
                                    <DefaultButton
                                        text="Left in office"
                                        checked={leftInOffice}
                                        onClick={() => setLeftInOffice(!leftInOffice)}
                                        disabled={submitting}
                                        iconProps={{ iconName: 'Home' }}
                                        styles={toggleButtonStyles(leftInOffice)}
                                    />
                                </Stack>

                                {/* Posted Branch */}
                                {posted.length > 0 && (
                                    <div style={branchCardStyle}>
                                        <Text style={{ 
                                            fontSize: '14px', 
                                            fontWeight: 600, 
                                            color: 'var(--text-primary)',
                                            marginBottom: '16px',
                                            display: 'block'
                                        }}>
                                            Posted Details
                                        </Text>
                                        
                                        {/* Recipients */}
                                        <Label style={{
                                            ...getFormLabelStyle(isDarkMode),
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                        }}>
                                            Recipients
                                        </Label>
                                        
                                        {postedRecipients.map((rec, idx) => (
                                            <div key={idx} style={recipientRowStyle}>
                                                <TextField
                                                    placeholder="Recipient"
                                                    value={rec.recipient}
                                                    onChange={(_, v) => {
                                                        const next = [...postedRecipients];
                                                        next[idx] = { ...next[idx], recipient: v || '' };
                                                        setPostedRecipients(next);
                                                        setPosted(next.map(x => 
                                                            `${x.recipient}${x.addressee ? ' (' + x.addressee + ')' : ''}${x.email ? ' <' + x.email + '>' : ''}`.trim()
                                                        ).filter(x => x));
                                                    }}
                                                    styles={{ ...inputStyles, root: { minWidth: 140, flex: 1 } }}
                                                    disabled={submitting}
                                                />
                                                <TextField
                                                    placeholder="Addressee"
                                                    value={rec.addressee}
                                                    onChange={(_, v) => {
                                                        const next = [...postedRecipients];
                                                        next[idx] = { ...next[idx], addressee: v || '' };
                                                        setPostedRecipients(next);
                                                        setPosted(next.map(x => 
                                                            `${x.recipient}${x.addressee ? ' (' + x.addressee + ')' : ''}${x.email ? ' <' + x.email + '>' : ''}`.trim()
                                                        ).filter(x => x));
                                                    }}
                                                    styles={{ ...inputStyles, root: { minWidth: 140, flex: 1 } }}
                                                    disabled={submitting}
                                                />
                                                <TextField
                                                    placeholder="Email"
                                                    value={rec.email}
                                                    onChange={(_, v) => {
                                                        const next = [...postedRecipients];
                                                        next[idx] = { ...next[idx], email: v || '' };
                                                        setPostedRecipients(next);
                                                        setPosted(next.map(x => 
                                                            `${x.recipient}${x.addressee ? ' (' + x.addressee + ')' : ''}${x.email ? ' <' + x.email + '>' : ''}`.trim()
                                                        ).filter(x => x));
                                                    }}
                                                    styles={{ ...inputStyles, root: { minWidth: 180, flex: 1 } }}
                                                    disabled={submitting}
                                                />
                                                <DefaultButton
                                                    text="Remove"
                                                    onClick={() => {
                                                        const next = postedRecipients.filter((_, i) => i !== idx);
                                                        setPostedRecipients(next);
                                                        const formatted = next.map(x => 
                                                            `${x.recipient}${x.addressee ? ' (' + x.addressee + ')' : ''}${x.email ? ' <' + x.email + '>' : ''}`.trim()
                                                        ).filter(x => x);
                                                        setPosted(formatted);
                                                        if (next.length === 0) setPosted([]);
                                                    }}
                                                    styles={defaultButtonStyles}
                                                    disabled={submitting}
                                                />
                                            </div>
                                        ))}
                                        
                                        <DefaultButton
                                            text="Add recipient"
                                            onClick={() => setPostedRecipients([...postedRecipients, { recipient: '', addressee: '', email: '' }])}
                                            styles={{
                                                ...defaultButtonStyles,
                                                root: {
                                                    ...defaultButtonStyles.root as object,
                                                    marginTop: '8px',
                                                }
                                            }}
                                            iconProps={{ iconName: 'Add' }}
                                            disabled={submitting}
                                        />

                                        {/* Date and Cover Letter */}
                                        <Stack horizontal tokens={{ childrenGap: 16 }} style={{ marginTop: '16px' }} wrap>
                                            <DatePicker
                                                label="Arrival date"
                                                value={arrivalDate || undefined}
                                                onSelectDate={(date) => setArrivalDate(date ?? null)}
                                                styles={{
                                                    root: { minWidth: 180, flex: 1 },
                                                    textField: inputStyles,
                                                }}
                                            />
                                            <TextField
                                                label="Covering letter link"
                                                value={coverLetter.link}
                                                onChange={(_, v) => setCoverLetter(c => ({ ...c, link: v || '' }))}
                                                styles={{ ...inputStyles, root: { minWidth: 240, flex: 2 } }}
                                                placeholder="Link"
                                            />
                                            <TextField
                                                label="Copies"
                                                type="number"
                                                value={coverLetter.copies.toString()}
                                                onChange={(_, v) => setCoverLetter(c => ({ ...c, copies: Number(v) || 1 }))}
                                                styles={{ ...inputStyles, root: { width: 100 } }}
                                            />
                                        </Stack>
                                        <Text style={getFormHelperTextStyle(isDarkMode)}>
                                            Copies to the address on the covering letter
                                        </Text>
                                    </div>
                                )}

                                {/* Left in Office Branch */}
                                {leftInOffice && (
                                    <div style={branchCardStyle}>
                                        <Text style={{ 
                                            fontSize: '14px', 
                                            fontWeight: 600, 
                                            color: 'var(--text-primary)',
                                            marginBottom: '16px',
                                            display: 'block'
                                        }}>
                                            Office Collection Details
                                        </Text>
                                        
                                        <Stack horizontal tokens={{ childrenGap: 16 }} wrap>
                                            <DatePicker
                                                label="Office-ready date"
                                                value={officeDate || undefined}
                                                onSelectDate={(date) => setOfficeDate(date ?? null)}
                                                styles={{
                                                    root: { minWidth: 180, flex: 1 },
                                                    textField: inputStyles,
                                                }}
                                            />
                                            <TextField
                                                label="Copies in office"
                                                type="number"
                                                value={copiesInOffice.toString()}
                                                onChange={(_, v) => setCopiesInOffice(Number(v) || 1)}
                                                styles={{ ...inputStyles, root: { width: 140 } }}
                                            />
                                        </Stack>
                                    </div>
                                )}
                            </div>

                            {/* Additional Notes Section */}
                            <div style={sectionStyle}>
                                <Text style={sectionHeaderStyle}>
                                    <Icon iconName="EditNote" style={{ marginRight: '8px', color: accentColor }} />
                                    Additional Notes
                                </Text>
                                <TextField
                                    label="Additional notes"
                                    multiline
                                    rows={4}
                                    value={notes}
                                    onChange={(_, v) => setNotes(v || '')}
                                    styles={getFormTextareaStyles(isDarkMode, 4)}
                                    placeholder="Any special instructions for the bundle team"
                                />
                            </div>

                            {/* System Note */}
                            <div style={getFormSystemNoteStyle(isDarkMode, 'success')}>
                                <Icon iconName="Info" style={getFormSystemNoteIconStyle(isDarkMode, 'success')} />
                                <div>
                                    <Text style={{ 
                                        fontSize: '13px', 
                                        fontWeight: 600, 
                                        color: 'var(--text-primary)',
                                        display: 'block',
                                        marginBottom: '4px'
                                    }}>
                                        What happens next
                                    </Text>
                                    <Text style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                                        An Asana task is created in the Bundle project.
                                    </Text>
                                    <Text style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        Operations are notified at <span style={{ fontWeight: 600, color: colours.green }}>operations@helix-law.com</span>.
                                    </Text>
                                </div>
                            </div>

                            {/* Status Feedback */}
                            {submitStatus !== 'idle' && (
                                <div style={getFormSubmitFeedbackStyle(isDarkMode, 
                                    submitStatus === 'success' ? 'success' : 
                                    submitStatus === 'error' ? 'error' : 'info'
                                )}>
                                    <Icon 
                                        iconName={
                                            submitStatus === 'success' ? 'CheckMark' :
                                            submitStatus === 'error' ? 'ErrorBadge' : 'More'
                                        } 
                                        style={getFormSubmitFeedbackIconStyle(
                                            submitStatus === 'success' ? 'success' : 
                                            submitStatus === 'error' ? 'error' : 'info'
                                        )} 
                                    />
                                    <Text style={{ fontWeight: 600, fontSize: '13px' }}>
                                        {submitMessage}
                                    </Text>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingTop: '16px',
                                borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Icon iconName="Contact" style={{ fontSize: '14px', color: 'var(--text-muted)' }} />
                                    <Text style={{ 
                                        fontSize: '13px', 
                                        fontWeight: 600, 
                                        color: 'var(--text-primary)' 
                                    }}>
                                        {(() => {
                                            if (users && users.length > 0) {
                                                const currentUser = users[0];
                                                const fullName = (currentUser as any)["Full Name"] || currentUser.FullName || `${currentUser.First || ''} ${currentUser.Last || ''}`.trim();
                                                return fullName.split(' ')[0];
                                            }
                                            const currentUser = userOptions.find(u => u.key === name);
                                            const userName = currentUser?.text || name || 'User';
                                            return userName.split(' ')[0];
                                        })()}
                                    </Text>
                                </div>
                                <Stack horizontal tokens={{ childrenGap: 12 }}>
                                    <PrimaryButton
                                        text={submitting ? 'Creating Task...' : submitStatus === 'success' ? 'Task Created!' : 'Submit Bundle'}
                                        onClick={handleSubmit}
                                        disabled={!isValid() || submitting || submitStatus === 'success'}
                                        styles={primaryButtonStyles}
                                        iconProps={{
                                            iconName: submitting ? 'More' : submitStatus === 'success' ? 'CheckMark' : 'Send'
                                        }}
                                    />
                                </Stack>
                            </div>
                        </Stack>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BundleForm;
