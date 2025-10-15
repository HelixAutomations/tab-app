// ---   Imports ---
// invisible change 2.1
//
import { Stack, Text, mergeStyles, Icon } from '@fluentui/react';
import { POID, TeamData } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { componentTokens } from '../../app/styles/componentTokens';
import React, { useMemo } from 'react';// Helper to calculate countdown to midnight after expiry date

// Button style for PEP & Address (inspired by client type, but color-coded, no rounded corners, full width, banner font size)
const verificationButtonStyle = (status: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 8px', // Match banner padding
    fontSize: '0.9rem', // Match banner font size
    fontWeight: 400,
    borderRadius: 0,
    border: '1px solid', // Changed from 2px to 1px for a neater look
    borderColor: status === 'passed' ? '#107C10' : '#FFB900',
    background: status === 'passed' ? '#e6f4ea' : '#fffbe6',
    color: status === 'passed' ? '#107C10' : '#b88600',
    marginRight: 0,
    marginBottom: 0,
    minWidth: 0,
    width: '50%',
    transition: 'background 0.18s, border 0.18s, color 0.18s',
    cursor: 'default',
    boxShadow: '0 1px 2px rgba(6,23,51,0.04)'
});
// src/tabs/matters/PoidCard.tsx
function getExpiryCountdown(expiryDateString: string | undefined): string | null {
    if (!expiryDateString) return null;
    // Parse expiry date (assume yyyy-mm-dd or ISO)
    const expiryDate = new Date(expiryDateString);
    if (isNaN(expiryDate.getTime())) return null;
    // Set to midnight (00:00) the day after expiry
    const expiryMidnight = new Date(expiryDate);
    expiryMidnight.setDate(expiryMidnight.getDate() + 1);
    expiryMidnight.setHours(0, 0, 0, 0);
    const now = new Date();
    let diff = expiryMidnight.getTime() - now.getTime();
    if (diff <= 0) return 'expired';
    // Calculate months, days, hours
    const msPerHour = 1000 * 60 * 60;
    const msPerDay = msPerHour * 24;
    // Months: rough calculation (30d per month)
    const months = Math.floor(diff / (msPerDay * 30));
    diff -= months * msPerDay * 30;
    const days = Math.floor(diff / msPerDay);
    diff -= days * msPerDay;
    const hours = Math.floor(diff / msPerHour);
    // Format string
    let parts = [];
    if (months > 0) parts.push(`${months}m`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (parts.length === 0) parts.push('<1h');
    return `expires in ${parts.join(' ')}`;
}

const getVerificationColor = (result: string) => {
    const level = result?.toLowerCase();
    if (level === 'passed' || level === 'pass' || level === 'approved') {
        return { background: '#e6f4ea', text: '#107C10', border: '#107C10' };
    }
    if (level === 'review' || level === 'pending') {
        return { background: '#fffbe6', text: '#b88600', border: '#FFB900' };
    }
    if (level === 'failed' || level === 'fail' || level === 'rejected') {
        return { background: '#fde7e9', text: '#d13438', border: '#d13438' };
    }
    return { background: '#f4f4f6', text: '#666', border: '#e1dfdd' };
};

// Helper to calculate age from a date string
const calculateAge = (dob: string): number => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

interface PoidCardProps {
    poid: POID;
    selected: boolean;
    onClick: () => void;
    teamData?: TeamData[] | null;
    companyName?: string; // invisible change 3: now passed from parent, not POID
    /** Optional explicit instruction reference to display (overrides POID-derived) */
    instructionRefOverride?: string;
    /** Optional explicit matter reference to display */
    matterRefOverride?: string;
}

// Updated card dimensions to fit nicely in a 2-column grid
const baseCardStyle = mergeStyles({
    position: 'relative',
    padding: '15px',
    borderRadius: '8px',
    width: '100%',
    minWidth: '280px', // Adjusted for 2-card layout
    maxWidth: '450px', // Increased maximum width for better use of space
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
    boxSizing: 'border-box',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
    fontFamily: 'Raleway, sans-serif',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, height 0.3s ease, z-index 0.2s ease',
    overflow: 'visible',
    zIndex: 1, // Default z-index for cards
    selectors: {
        ':hover': {
            transform: 'translateY(-1px)', // Professional subtle lift
            boxShadow: '0 8px 16px rgba(0,0,0,0.12)',
        },
        // Show icon in full opacity on hover
        ':hover .backgroundIcon': {
            opacity: 1,
        },
    },
});

const darkCardStyle = mergeStyles({
    background: 'linear-gradient(135deg, #1a2332 0%, #151d28 100%)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontFamily: 'Raleway, sans-serif',
    color: '#e2e8f0',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
    selectors: {
        ':hover': {
            boxShadow: '0 8px 16px rgba(0,0,0,0.4)',
        },
    },
});

const selectedCardStyle = mergeStyles({
    // Keep border on selection, matching instruction card styling
    border: `2px solid ${colours.highlight}`,
    background: `linear-gradient(135deg, #EAF3FB 0%, #DDEBF7 100%)`,
    fontFamily: 'Raleway, sans-serif',
    selectors: {
        // Keep icon at full opacity when selected
        '.inlinePersonCompanyIcon': {
            opacity: '1 !important',
        }
    }
});

const selectedDarkCardStyle = mergeStyles({
    border: `2px solid ${colours.highlight}`,
    background: `linear-gradient(135deg, rgba(54,144,206,0.15) 0%, rgba(54,144,206,0.08) 100%)`,
    color: '#e2e8f0',
    fontFamily: 'Raleway, sans-serif',
    selectors: {
        '.inlinePersonCompanyIcon': {
            opacity: '1 !important',
        }
    }
});

const iconStyle = mergeStyles({
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 24,
    color: colours.highlight,
});

const bottomContainerStyle = mergeStyles({
    position: 'absolute',
    bottom: 15,
    left: 15,
    right: 15, // Extended to allow more space
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10, // Ensure it stays on top
    height: '30px', // Set explicit height for the bottom container
});

const idTextStyle = mergeStyles({
    fontSize: '0.8rem',
    fontWeight: 600,
    fontFamily: 'Raleway, sans-serif',
    maxWidth: '70%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    padding: '2px 0',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
});

const badgeStyle = mergeStyles({
    padding: '2px 8px',
    borderRadius: '0px',
    backgroundColor: colours.grey,
    color: '#333',
    fontSize: '0.7rem',
    fontWeight: 600,
    fontFamily: 'Raleway, sans-serif',
});

const backgroundIconStyle = mergeStyles({
    position: 'absolute',
    bottom: 20,
    right: 10,
    fontSize: '55px',
    transformOrigin: 'bottom right',
    opacity: 0.3, // Reduced default opacity
    pointerEvents: 'none',
    zIndex: 0,
    color: colours.highlight,
    overflow: 'hidden',
    transition: 'opacity 0.2s ease', // Add transition for smooth opacity change
});

const contentStyle = mergeStyles({
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    overflow: 'visible', // Allow content to expand naturally
    width: '100%', // Ensure content uses full width
});

// Animate in the links on card hover
const cardWithLinksHover = mergeStyles({
    selectors: {
        ':hover': {
            zIndex: '10 !important', // Bring expanded card above others
            boxShadow: '0 6px 20px rgba(0,0,0,0.2) !important', // Enhanced shadow when expanded
            border: '1px solid #e1e5ea', // Subtle border when expanded
            transform: 'translateY(-2px) !important', // Consistent with base hover
        },
        ':hover .profileLink': {
            opacity: 1,
            pointerEvents: 'auto',
            height: '44px', // Animate in height for links
        },
        ':hover .expandableContact': {
            maxHeight: '250px',
            opacity: 1,
            padding: '8px',
            marginTop: '0px', // No gap for visual connection
        },
        ':hover .chevron-indicator': {
            transform: 'rotate(180deg)',
        },
        ':hover .expandableContact .contact-item': {
            animation: 'cascadeIn 0.4s ease-out forwards',
        },
        ':hover .expandableContact .contact-item:nth-child(1)': { animationDelay: '0.05s' },
        ':hover .expandableContact .contact-item:nth-child(2)': { animationDelay: '0.1s' },
        ':hover .expandableContact .contact-item:nth-child(3)': { animationDelay: '0.15s' },
        ':hover .expandableContact .contact-item:nth-child(4)': { animationDelay: '0.2s' },
        ':hover .expandableContact .contact-item:nth-child(5)': { animationDelay: '0.25s' },
        ':hover .expandableContact .contact-item:nth-child(6)': { animationDelay: '0.3s' },
    },
});

// Compact contact block (always visible)
const contactBlockStyle = mergeStyles({
    padding: '8px',
    backgroundColor: '#f8f9fb',
    border: '1px solid #e1e5ea',
    marginTop: '4px',
});

// New style for profile link buttons - same size and behaviour as client type buttons
const profileButtonStyle = mergeStyles({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    color: '#061733',
    border: '2px solid #e1dfdd',
    borderRadius: 0,
    padding: '12px 18px',
    fontSize: '0.9rem',
    fontWeight: 600,
    background: '#fff',
    transition: 'background 0.18s, border 0.18s, color 0.18s',
    minWidth: 0,
    boxShadow: '0 1px 2px rgba(6,23,51,0.04)',
    cursor: 'pointer',
    gap: 8,
    selectors: {
        ':hover': {
            background: '#e7f1ff',
            border: '2px solid #3690CE',
            color: '#3690CE',
            textDecoration: 'none',
        },
        ':focus': {
            outline: '2px solid #3690CE',
        },
        ':active': {
            background: '#d0e7ff',
        },
    },
});

const PoidCard: React.FC<PoidCardProps> = ({ poid, selected, onClick, teamData, companyName, instructionRefOverride, matterRefOverride }) => {
    const { isDarkMode } = useTheme();


    // Compose card style
    const cardStyle = mergeStyles(
        baseCardStyle,
        isDarkMode && darkCardStyle,
        selected && (isDarkMode ? selectedDarkCardStyle : selectedCardStyle),
        cardWithLinksHover,
        'poid-card'
    );

    // Choose icon based on whether POID has company information
    const isCompany = !!(poid.company_name || poid.company_number);
    const backgroundIconName = isCompany ? "CityNext" : "Contact";

    const teamMember = teamData?.find(
        (member) => member.Email?.toLowerCase() === poid.poc?.toLowerCase()
    );
    const badgeInitials = teamMember?.Initials;

    const stage = poid.stage?.toLowerCase();
    const isCompleted = stage === 'completed';
    const isReview = stage === 'review';

    // --- New: Extract more fields for realistic display ---
    // Accept both snake_case and camelCase for compatibility, but POID type is mostly snake_case
    const fullName = `${poid.prefix || ''} ${poid.first || '[No First Name]'} ${poid.last || '[No Last Name]'}`.trim();
    // companyName is now a prop, not from poid
    const dob = poid.date_of_birth;
    const age = dob ? calculateAge(dob) : undefined;
    const nationality = poid.nationality;
    const nationalityAlpha2 = poid.nationality_iso || poid.country_code;
    const email = (poid as any).email || (poid as any).Email;
    const phone = (poid as any).phone || (poid as any).Phone;
    // Defensive: POID type may use camelCase for some fields, fallback to those if needed
    // Defensive: fallback to camelCase only if POID type allows index signature
    const address = [
        (poid as any).house_number || (poid as any).HouseNumber,
        (poid as any).street || (poid as any).Street,
        (poid as any).city || (poid as any).City,
        (poid as any).county || (poid as any).County,
        (poid as any).post_code || (poid as any).Postcode,
        (poid as any).country || (poid as any).Country
    ].filter(Boolean).join(', ');
    const idType = (poid as any).id_type || (poid as any).IdType;
    const passport = (poid as any).passport_number || (poid as any).PassportNumber;
    const driversLicense = (poid as any).drivers_license_number || (poid as any).DriversLicenseNumber;
    const instructionRef = instructionRefOverride || (poid as any).instruction_ref || (poid as any).InstructionRef;
    const matterId = matterRefOverride || (poid as any).matter_id || (poid as any).MatterId;
    const prospectId = (poid as any).prospect_id || (poid as any).ProspectId;
    const paymentResult = (poid as any).payment_result || (poid as any).PaymentResult;
    const paymentAmount = (poid as any).payment_amount || (poid as any).PaymentAmount;
    const paymentProduct = (poid as any).payment_product || (poid as any).PaymentProduct;

    // Deal/Service info
    const serviceDescription =
        (poid as any).service_description ||
        (poid as any).ServiceDescription ||
        paymentProduct;
    const dealAmount = parseFloat((poid as any).amount || (poid as any).Amount || paymentAmount) || 0;
    
    // ID Verification fields
    const checkResult = (poid as any).check_result || poid.check_result;
    const pepSanctionsResult = (poid as any).pep_sanctions_result || poid.pep_sanctions_result || (poid as any).PEPAndSanctionsCheckResult;
    const addressVerificationResult = (poid as any).address_verification_result || poid.address_verification_result || (poid as any).AddressVerificationResult;
    const checkExpiry = (poid as any).check_expiry || poid.check_expiry || (poid as any).CheckExpiry;
    const checkId = (poid as any).check_id || poid.check_id || (poid as any).EIDCheckId;
    const eidStatus = (poid as any).EIDStatus || (poid as any).eid_status || '';
    const eidCheckedDate = (poid as any).EIDCheckedDate || (poid as any).eid_checked_date || '';
    
    const verificationColors = getVerificationColor(checkResult || '');
    const pepColors = getVerificationColor(pepSanctionsResult || '');
    const addressColors = getVerificationColor(addressVerificationResult || '');
    // --- End new fields ---

    return (
        <div onClick={onClick} className={cardStyle}>
            <div className={contentStyle}>
                <Stack tokens={{ childrenGap: 8 }}>
                    {/* Name and Company */}
                    <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center" style={{ width: '100%' }}>
                        <Text
                            variant="mediumPlus"
                            styles={{
                                root: {
                                    fontWeight: 700,
                                    color: colours.highlight,
                                    fontFamily: 'Raleway, sans-serif',
                                    lineHeight: '1.2',
                                },
                            }}
                        >
                            {companyName && (
                                <>
                                    <span style={{ color: '#666', fontWeight: 600, marginRight: '4px' }}>{companyName}</span>
                                    <span style={{ color: '#999', marginRight: '4px' }}>|</span>
                                </>
                            )}
                            {fullName}
                        </Text>
                        {age !== undefined && (
                            <Text variant="small" styles={{ root: { fontFamily: 'Raleway, sans-serif', lineHeight: '1.2', color: '#555' } }}>{age} yrs</Text>
                        )}
                        {nationalityAlpha2 && (
                            <Text variant="small" styles={{ root: { fontFamily: 'Raleway, sans-serif', lineHeight: '1.2', color: '#555' } }}>{nationalityAlpha2}</Text>
                        )}
                        <div style={{ flex: 1 }} />
                        <Icon
                            iconName={backgroundIconName}
                            style={{
                                fontSize: 22,
                                opacity: 0.3,
                                transition: 'opacity 0.2s',
                                color: colours.highlight,
                                marginLeft: 8,
                                verticalAlign: 'middle',
                            }}
                            className="inlinePersonCompanyIcon"
                        />
                    </Stack>
                    {/* Trace chips under name: Instruction & Matter */}
                    {(instructionRef || matterId) && (
                        <Stack horizontal tokens={{ childrenGap: 6 }} verticalAlign="center">
                            {instructionRef && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '2px 6px', border: '1px solid #e1e5ea', borderRadius: 6,
                                    background: '#F4F6F9', color: '#425466', fontSize: '0.7rem', fontWeight: 600
                                }}>
                                    <Icon iconName="TextDocument" styles={{ root: { fontSize: 10, color: '#6B7280' } }} />
                                    {instructionRef}
                                </span>
                            )}
                            {matterId && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '2px 6px', border: '1px solid #e1e5ea', borderRadius: 6,
                                    background: '#F4F6F9', color: '#425466', fontSize: '0.7rem', fontWeight: 600
                                }}>
                                    <Icon iconName="FabricFolder" styles={{ root: { fontSize: 10, color: '#6B7280' } }} />
                                    {matterId}
                                </span>
                            )}
                        </Stack>
                    )}
                    {/* Simplified status chips with visual hierarchy */}
                    {(checkResult || pepSanctionsResult || addressVerificationResult || paymentResult) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {/* Main ID chip - prominent */}
                            {checkResult && (
                                <div style={{
                                    padding: '6px 10px',
                                    backgroundColor: verificationColors.background,
                                    color: verificationColors.text,
                                    border: `2px solid ${verificationColors.border}`,
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                }}>
                                    <Icon iconName="Shield" styles={{ root: { fontSize: 12 } }} />
                                    <span>ID Verification: {checkResult}</span>
                                </div>
                            )}
                            
                            {/* Sub-chips connected to main ID with reduced visual weight */}
                            {(pepSanctionsResult || addressVerificationResult) && (
                                <div style={{ 
                                    marginLeft: 16, 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: 2,
                                    position: 'relative'
                                }}>
                                    {/* Connection line */}
                                    <div style={{
                                        position: 'absolute',
                                        left: -12,
                                        top: 0,
                                        bottom: 0,
                                        width: 2,
                                        backgroundColor: checkResult ? verificationColors.border : '#E5E7EB',
                                        opacity: 0.3
                                    }} />
                                    
                                    {pepSanctionsResult && (
                                        <div style={{
                                            padding: '3px 8px',
                                            backgroundColor: pepColors.background,
                                            color: pepColors.text,
                                            border: `1px solid ${pepColors.border}40`,
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            opacity: 0.9
                                        }}>
                                            <Icon iconName="PageShield" styles={{ root: { fontSize: 9 } }} />
                                            <span>PEP: {pepSanctionsResult}</span>
                                        </div>
                                    )}
                                    
                                    {addressVerificationResult && (
                                        <div style={{
                                            padding: '3px 8px',
                                            backgroundColor: addressColors.background,
                                            color: addressColors.text,
                                            border: `1px solid ${addressColors.border}40`,
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            opacity: 0.9
                                        }}>
                                            <Icon iconName="POI" styles={{ root: { fontSize: 9 } }} />
                                            <span>Address: {addressVerificationResult}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Payment chip separate if present */}
                            {paymentResult && (
                                <div style={{
                                    padding: '4px 8px',
                                    backgroundColor: paymentResult === 'successful' ? '#e6f4ea' : paymentResult === 'failed' ? '#fde7e9' : '#fffbe6',
                                    color: paymentResult === 'successful' ? '#107C10' : paymentResult === 'failed' ? '#d13438' : '#b88600',
                                    border: `1px solid ${paymentResult === 'successful' ? '#107C10' : paymentResult === 'failed' ? '#d13438' : '#FFB900'}60`,
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}>
                                    <Icon iconName="PaymentCard" styles={{ root: { fontSize: 9 } }} />
                                    <span>Payment: {paymentResult}</span>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Simplified Contact Details - Only show most essential */}
                    <div className={contactBlockStyle}>
                        <Stack tokens={{ childrenGap: 4 }}>
                            {/* Only show email and phone for cleaner look */}
                            {email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Icon iconName="Mail" styles={{ root: { fontSize: '11px', color: '#888' } }} />
                                    <Text variant="xSmall" styles={{ root: { color: '#555', fontSize: '0.7rem', fontFamily: 'Raleway, sans-serif' } }}>
                                        {email}
                                    </Text>
                                </div>
                            )}
                            {phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Icon iconName="Phone" styles={{ root: { fontSize: '11px', color: '#888' } }} />
                                    <Text variant="xSmall" styles={{ root: { color: '#555', fontSize: '0.7rem', fontFamily: 'Raleway, sans-serif' } }}>
                                        {phone}
                                    </Text>
                                </div>
                            )}
                            {/* Show address in condensed form if available */}
                            {address && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                    <Icon iconName="MapPin" styles={{ root: { fontSize: '11px', color: '#888', marginTop: '1px' } }} />
                                    <Text variant="xSmall" styles={{ root: { color: '#777', fontSize: '0.65rem', fontStyle: 'italic', fontFamily: 'Raleway, sans-serif', lineHeight: '1.2' } }}>
                                        {address.length > 50 ? `${address.substring(0, 47)}...` : address}
                                    </Text>
                                </div>
                            )}
                        </Stack>
                    </div>
                    {/* EID checked date & status */}
                    {(eidStatus || eidCheckedDate) && (
                        <Text variant="xSmall" styles={{ root: { 
                            color: '#888', 
                            fontFamily: 'Raleway, sans-serif', 
                            fontSize: '0.7rem'
                        }}}>
                            {eidStatus ? `EID ${eidStatus}` : ''}{eidStatus && eidCheckedDate ? ' • ' : ''}{eidCheckedDate ? `Checked ${new Date(eidCheckedDate).toLocaleDateString()}` : ''}
                        </Text>
                    )}
                    {/* Correlation ID - on its own line */}
                    {checkId && (
                        <Text variant="xSmall" styles={{ root: { 
                            color: '#aaa', 
                            fontFamily: 'Raleway, sans-serif', 
                            fontSize: '0.65rem',
                            letterSpacing: '0.5px'
                        }}}>
                            #{checkId}
                        </Text>
                    )}
                    {/* Verification expiry - subtle info */}
                    {checkExpiry && (
                        <Text variant="xSmall" styles={{ root: { 
                            color: getExpiryCountdown(checkExpiry) === 'expired' ? '#d13438' : '#888',
                            fontStyle: 'italic',
                            fontSize: '0.7rem',
                            fontFamily: 'Raleway, sans-serif'
                        }}}>
                            {getExpiryCountdown(checkExpiry) ? `Expires ${getExpiryCountdown(checkExpiry)}` : `Verified until ${new Date(checkExpiry).toLocaleDateString()}`}
                        </Text>
                    )}
                    {/* Payment info if present - only show if there's meaningful data */}
                    {(paymentResult || (serviceDescription && serviceDescription.trim() && serviceDescription !== '0') || (dealAmount && dealAmount > 0 && !isNaN(dealAmount))) && (
                        <Stack tokens={{ childrenGap: 4 }} verticalAlign="center">
                            {paymentResult && (
                                <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                                    <Text variant="small" styles={{ root: { color: paymentResult === 'successful' ? '#107C10' : paymentResult === 'failed' ? '#D83B01' : '#555', fontFamily: 'Raleway, sans-serif' } }}>Payment: {paymentResult}</Text>
                                </Stack>
                            )}
                            {((serviceDescription && serviceDescription.trim() && serviceDescription !== '0') || (dealAmount && dealAmount > 0 && !isNaN(dealAmount))) && (
                                <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
                                    {serviceDescription && serviceDescription.trim() && serviceDescription !== '0' && (
                                        <Text variant="small" styles={{ root: { color: '#3690CE', fontWeight: 600, fontSize: '0.85rem', fontFamily: 'Raleway, sans-serif' } }}>
                                            {serviceDescription}
                                        </Text>
                                    )}
                                    {dealAmount && dealAmount > 0 && !isNaN(dealAmount) && (
                                        <Text variant="small" styles={{ root: { color: '#3690CE', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'Raleway, sans-serif' } }}>
                                            £{dealAmount.toLocaleString()}
                                        </Text>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    )}
                    {/* Instruction/Deal IDs for traceability - REMOVED, moved up with name */}
                </Stack>
            </div>
            <div className={bottomContainerStyle}>
                {badgeInitials && (
                    <div className={badgeStyle} aria-label={`POC: ${badgeInitials}`}>
                        {badgeInitials}
                    </div>
                )}
            </div>
            <style>{`
                .poid-card:hover .inlinePersonCompanyIcon {
                    opacity: 1 !important;
                }
                
                @keyframes cascadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};

export default PoidCard;
