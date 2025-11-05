import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Modal,
  IconButton,
  Text,
  TextField,
  PrimaryButton,
  DefaultButton,
  MessageBar,
  MessageBarType,
  Dropdown,
  IDropdownOption,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { TeamData } from '../../app/functionality/types';

// Add spinner animation
const spinnerKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Inject the animation into the document
if (typeof document !== 'undefined') {
  const styleId = 'create-contact-modal-animations';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = spinnerKeyframes;
    document.head.appendChild(style);
  }
}

interface CreateContactModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onSuccess?: (enquiryId: string) => void;
  userEmail?: string;
  teamData?: TeamData[] | null;
}

interface ContactFormData {
  // Contact Information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  // Case Details
  aow: string;
  tow: string;
  moc: string;
  value: string;
  notes: string;
  // Referral/Source
  rep: string;
  contactReferrer: string;
  companyReferrer: string;
  source: string;
}

// Dropdown options - match existing app values
const areaOfWorkOptions: IDropdownOption[] = [
  { key: 'Commercial', text: 'Commercial' },
  { key: 'Construction', text: 'Construction' },
  { key: 'Employment', text: 'Employment' },
  { key: 'Property', text: 'Property' },
];

const methodOfContactOptions: IDropdownOption[] = [
  { key: 'Call In', text: 'Call In' },
  { key: 'Web Form', text: 'Web Form' },
  { key: 'Direct FE Email', text: 'Direct FE Email' },
  { key: 'Direct Firm Email', text: 'Direct Firm Email' },
];

const valueBandOptions: IDropdownOption[] = [
  { key: '£10,000 or less', text: '£10,000 or less' },
  { key: '£10,000 to £50,000', text: '£10,000 to £50,000' },
  { key: '£50,000 to £100,000', text: '£50,000 to £100,000' },
  { key: '£100,000 to £250,000', text: '£100,000 to £250,000' },
  { key: '£250,000 to £500,000', text: '£250,000 to £500,000' },
  { key: '£500,000 or more', text: '£500,000 or more' },
  { key: 'Unsure', text: 'Unsure' },
  { key: 'Non-monetary claim', text: 'Non-monetary claim' },
];

// Helper to generate source options with user initials
const getSourceOptions = (userEmail?: string): IDropdownOption[] => {
  const userInitials = userEmail?.split('@')[0]?.slice(0, 2)?.toLowerCase() || 'fe';
  return [
    { key: 'referral', text: 'Referral' },
    { key: 'organic search', text: 'Organic Search' },
    { key: 'paid search', text: 'Paid Search' },
    { key: `${userInitials} following`, text: `${userInitials.toUpperCase()} Following` },
    { key: 'tbc', text: 'TBC' },
  ];
};

/**
 * Modal for creating a new contact/enquiry record in the instructions database.
 * 
 * DEDUPE LOGIC:
 * The system automatically deduplicates enquiries based on:
 * - Contact identity: email/phone/name (normalized)
 * - Date: Same day enquiries are considered duplicates
 * - Status preference: Claimed > Triaged > Unclaimed
 * - Source preference: New (v2/instructions DB) > Legacy (helix-core-data)
 * 
 * When a contact is created here, it will:
 * 1. Be inserted into instructions.dbo.enquiries table
 * 2. Appear as unclaimed initially (poc = null or team@helix-law.com)
 * 3. Be deduplicated against existing enquiries by the frontend logic
 * 4. Be available for claiming and conversion to pitch/instruction
 */
const CreateContactModal: React.FC<CreateContactModalProps> = ({
  isOpen,
  onDismiss,
  onSuccess,
  userEmail,
  teamData,
}) => {
  const { isDarkMode } = useTheme();
  
  // Generate team member options from active team members
  const teamMemberOptions: IDropdownOption[] = useMemo(() => {
    if (!teamData) return [];
    
    return teamData
      .filter(member => member.status?.toLowerCase() === 'active' && member.Email)
      .map(member => ({
        key: member.Email!,
        text: member['Full Name'] || member.Email!,
      }))
      .sort((a, b) => a.text.localeCompare(b.text));
  }, [teamData]);
  
  const [formData, setFormData] = useState<ContactFormData>({
    // Contact Information
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    // Case Details
    aow: '',
    tow: '',
    moc: 'Direct FE Email', // Default to Direct FE Email
    value: '',
    notes: '',
    // Referral/Source
    rep: userEmail || '', // Default to current user's email
    contactReferrer: '',
    companyReferrer: '',
    source: '',
  });
  
  // Update rep when userEmail changes (e.g., modal reopens with different user)
  useEffect(() => {
    if (userEmail && !formData.rep) {
      setFormData(prev => ({ ...prev, rep: userEmail }));
    }
  }, [userEmail, formData.rep]);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFieldChange = useCallback((field: keyof ContactFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Validation
    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required');
      return;
    }

    if (!formData.email.trim() && !formData.phone.trim()) {
      setError('Either email or phone is required');
      return;
    }

    // Email validation (if provided)
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        setError('Please enter a valid email address');
        return;
      }
    }

    // Area of Work, Method of Contact, Value Band, Point of Contact, and Source are required
    if (!formData.aow) {
      setError('Area of Work is required');
      return;
    }

    if (!formData.moc) {
      setError('Method of Contact is required');
      return;
    }

    if (!formData.value) {
      setError('Value Band is required');
      return;
    }

    if (!formData.rep) {
      setError('Point of Contact is required');
      return;
    }

    if (!formData.source) {
      setError('Source is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);
      setSavingProgress('Validating contact information...');

      // Small delay to show initial progress
      await new Promise(resolve => setTimeout(resolve, 300));

      setSavingProgress('Preparing data for submission...');

      // Format payload for processEnquiry function (instructions database)
      const payload = {
        data: {
          first: formData.firstName.trim(),
          last: formData.lastName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          aow: formData.aow || undefined,
          tow: formData.tow.trim() || undefined,
          moc: formData.moc || undefined,
          value: formData.value.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          rep: formData.rep.trim() || userEmail || undefined,
          contact_referrer: formData.contactReferrer.trim() || undefined,
          company_referrer: formData.companyReferrer.trim() || undefined,
          source: formData.source.trim().toLowerCase() || 'manual',
        },
      };

      setSavingProgress('Creating contact record...');

      const response = await fetch('/api/enquiries-unified/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create contact: ${response.statusText}`);
      }

      setSavingProgress('Processing response...');
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create contact');
      }

      const enquiryId = result.enquiryId || result.id;
      const contactName = `${formData.firstName} ${formData.lastName}`;
      
      setSavingProgress('Finalizing...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      setSuccess(`✓ Contact created: ${contactName}`);
      setSavingProgress('');
      
      // Close and notify after brief success message
      setTimeout(() => {
        if (onSuccess && enquiryId) {
          onSuccess(enquiryId.toString());
        }
        handleClose();
      }, 1800);

    } catch (err) {
      console.error('Failed to create contact:', err);
      setError(err instanceof Error ? err.message : 'Failed to create contact');
      setSavingProgress('');
    } finally {
      setIsSaving(false);
    }
  }, [formData, onSuccess, userEmail]);

  const handleClose = useCallback(() => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      aow: '',
      tow: '',
      moc: 'Direct FE Email', // Reset to default
      value: '',
      notes: '',
      rep: userEmail || '', // Reset to current user
      contactReferrer: '',
      companyReferrer: '',
      source: '',
    });
    setError(null);
    setSuccess(null);
    onDismiss();
  }, [onDismiss, userEmail]);

  const modalStyles = {
    main: {
      background: isDarkMode 
        ? 'rgba(11, 18, 32, 0.95)' 
        : 'rgba(255, 255, 255, 0.78)',
      borderRadius: 12,
      border: `1px solid ${isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(15, 23, 42, 0.08)'}`,
      boxShadow: isDarkMode 
        ? '0 10px 30px rgba(0, 0, 0, 0.5)' 
        : '0 10px 30px rgba(2, 6, 23, 0.1)',
      backdropFilter: 'blur(10px)',
      padding: 0,
      maxWidth: 700,
      width: '90vw',
      maxHeight: '90vh',
      overflow: 'hidden' as const
    }
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 28px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(15, 23, 42, 0.08)'}`,
    background: isDarkMode 
      ? 'rgba(15, 23, 42, 0.3)'
      : 'rgba(255, 255, 255, 0.6)'
  };

  const contentStyle = {
    padding: '28px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 20,
    overflowY: 'auto' as const,
    maxHeight: 'calc(90vh - 160px)'
  };

  const sectionStyle = {
    padding: '20px',
    background: isDarkMode 
      ? 'rgba(255, 255, 255, 0.02)' 
      : 'rgba(255, 255, 255, 0.85)',
    borderRadius: 12,
    border: `1px solid ${isDarkMode ? 'rgba(51, 65, 85, 0.2)' : 'rgba(15, 23, 42, 0.08)'}`,
    boxShadow: isDarkMode 
      ? '0 2px 8px rgba(0, 0, 0, 0.3)' 
      : '0 2px 8px rgba(2, 6, 23, 0.06)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12
  };

  const sectionHeaderStyle = {
    fontWeight: 600,
    fontSize: 13,
    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : '#6B6B6B',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  };

  const buttonRowStyle = {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    paddingTop: 8
  };

  const buttonStyles = {
    root: {
      borderRadius: 8,
      height: 36,
      padding: '8px 16px',
      border: '1px solid',
      borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.4)' : 'rgba(100, 116, 139, 0.26)',
      transition: 'all 0.2s ease',
      fontWeight: '600',
      fontSize: 13,
    },
    rootHovered: {
      borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.6)' : 'rgba(100, 116, 139, 0.4)',
      transform: 'translateY(-1px)',
    },
    rootPressed: {
      transform: 'translateY(0px)',
    }
  };

  const cancelButtonStyles = {
    root: {
      ...buttonStyles.root,
      background: isDarkMode ? 'rgba(30, 41, 59, 0.4)' : 'rgba(148, 163, 184, 0.04)',
      color: isDarkMode ? '#E5E7EB' : 'rgba(51, 65, 85, 0.95)',
    },
    rootHovered: {
      ...buttonStyles.rootHovered,
      background: isDarkMode ? 'rgba(30, 41, 59, 0.6)' : 'rgba(148, 163, 184, 0.08)',
    },
    rootPressed: {
      ...buttonStyles.rootPressed,
      background: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'rgba(148, 163, 184, 0.12)',
    }
  };

  const primaryButtonStyles = {
    root: {
      ...buttonStyles.root,
      background: isDarkMode 
        ? 'linear-gradient(135deg, rgba(54, 144, 206, 0.9) 0%, rgba(54, 144, 206, 0.8) 100%)'
        : 'linear-gradient(135deg, #3690CE 0%, #2b7ab8 100%)',
      borderColor: isDarkMode ? 'rgba(54, 144, 206, 0.6)' : 'rgba(54, 144, 206, 0.4)',
      color: '#FFFFFF',
      boxShadow: isDarkMode 
        ? '0 2px 8px rgba(54, 144, 206, 0.2)'
        : '0 2px 8px rgba(54, 144, 206, 0.25)',
    },
    rootHovered: {
      ...buttonStyles.rootHovered,
      background: isDarkMode 
        ? 'linear-gradient(135deg, rgba(54, 144, 206, 1) 0%, rgba(54, 144, 206, 0.9) 100%)'
        : 'linear-gradient(135deg, #2b7ab8 0%, #236599 100%)',
      boxShadow: isDarkMode 
        ? '0 4px 12px rgba(54, 144, 206, 0.3)'
        : '0 4px 12px rgba(54, 144, 206, 0.35)',
    },
    rootPressed: {
      ...buttonStyles.rootPressed,
      background: isDarkMode 
        ? 'linear-gradient(135deg, rgba(43, 122, 184, 0.9) 0%, rgba(43, 122, 184, 0.8) 100%)'
        : 'linear-gradient(135deg, #236599 0%, #1d5480 100%)',
    },
    rootDisabled: {
      background: isDarkMode ? 'rgba(51, 65, 85, 0.3)' : 'rgba(148, 163, 184, 0.2)',
      borderColor: isDarkMode ? 'rgba(51, 65, 85, 0.2)' : 'rgba(100, 116, 139, 0.15)',
      color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)',
      boxShadow: 'none',
    }
  };

  const fieldStyles = {
    fieldGroup: {
      borderColor: isDarkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(15, 23, 42, 0.12)',
      background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : '#FFFFFF',
      borderRadius: 6,
      '::after': {
        borderRadius: 6
      }
    },
    field: {
      color: isDarkMode ? '#E5E7EB' : '#061733',
      '::placeholder': {
        color: isDarkMode ? 'rgba(148, 163, 184, 0.5)' : 'rgba(107, 107, 107, 0.6)'
      }
    },
    subComponentStyles: {
      label: {
        root: {
          color: isDarkMode ? '#E5E7EB' : '#061733',
          fontWeight: 500,
        }
      }
    }
  };

  const dropdownStyles = {
    label: {
      color: isDarkMode ? '#E5E7EB' : '#061733',
      fontWeight: '500' as any,
    },
    dropdown: {
      borderColor: isDarkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(15, 23, 42, 0.12)',
      background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : '#FFFFFF',
      borderRadius: 6,
      ':hover': {
        borderColor: isDarkMode ? 'rgba(71, 85, 105, 0.6)' : 'rgba(15, 23, 42, 0.2)',
      },
      ':focus': {
        borderColor: isDarkMode ? colours.blue : colours.highlight,
      }
    },
    title: {
      borderColor: isDarkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(15, 23, 42, 0.12)',
      background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : '#FFFFFF',
      color: isDarkMode ? '#E5E7EB' : '#061733',
      borderRadius: 6,
    },
    caretDownWrapper: {
      color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(107, 107, 107, 0.7)',
    },
    callout: {
      border: `1px solid ${isDarkMode ? 'rgba(51, 65, 85, 0.6)' : 'rgba(15, 23, 42, 0.12)'}`,
      borderRadius: 8,
      boxShadow: isDarkMode 
        ? '0 8px 24px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)'
        : '0 8px 24px rgba(15, 23, 42, 0.15), 0 0 1px rgba(15, 23, 42, 0.05)',
      background: isDarkMode ? 'rgba(15, 23, 42, 0.95) !important' : 'rgba(255, 255, 255, 0.95) !important',
      backdropFilter: 'blur(12px)',
      selectors: {
        '.ms-Callout-main': {
          background: isDarkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        }
      }
    },
    dropdownItemsWrapper: {
      background: 'transparent',
      selectors: {
        '.ms-Dropdown-items': {
          background: 'transparent',
        }
      }
    },
    dropdownItem: {
      color: isDarkMode ? '#E5E7EB !important' : '#061733 !important',
      background: 'transparent',
      selectors: {
        '&:hover': {
          background: isDarkMode ? 'rgba(71, 85, 105, 0.3) !important' : 'rgba(15, 23, 42, 0.06) !important',
          color: isDarkMode ? '#FFFFFF !important' : '#000000 !important',
        },
        '.ms-Button-flexContainer': {
          color: isDarkMode ? '#E5E7EB' : '#061733',
        },
        '.ms-Dropdown-optionText': {
          color: isDarkMode ? '#E5E7EB' : '#061733',
        }
      }
    },
    dropdownItemSelected: {
      background: isDarkMode ? 'rgba(54, 144, 206, 0.2) !important' : 'rgba(54, 144, 206, 0.12) !important',
      color: isDarkMode ? `${colours.blue} !important` : `${colours.highlight} !important`,
      selectors: {
        '&:hover': {
          background: isDarkMode ? 'rgba(54, 144, 206, 0.3) !important' : 'rgba(54, 144, 206, 0.18) !important',
          color: isDarkMode ? `${colours.blue} !important` : `${colours.highlight} !important`,
        },
        '&:hover .ms-Dropdown-optionText': {
          color: isDarkMode ? colours.blue : colours.highlight,
        },
        '.ms-Dropdown-optionText': {
          color: isDarkMode ? colours.blue : colours.highlight,
        }
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={handleClose}
      isBlocking={isSaving}
      styles={{ main: modalStyles.main }}
    >
      <div style={headerStyle}>
        <Text variant="large" styles={{ 
          root: { 
            fontWeight: 600, 
            color: isDarkMode ? colours.dark.text : colours.light.text 
          } 
        }}>
          Create New Contact
        </Text>
        <IconButton
          iconProps={{ iconName: 'Cancel' }}
          onClick={handleClose}
          disabled={isSaving}
          styles={{
            root: {
              color: isDarkMode ? colours.dark.subText : colours.light.subText,
            }
          }}
        />
      </div>

      <div style={contentStyle}>
        {error && (
          <MessageBar 
            messageBarType={MessageBarType.error}
            styles={{
              root: {
                background: isDarkMode ? 'rgba(187, 62, 66, 0.15)' : 'rgba(187, 62, 66, 0.08)',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(187, 62, 66, 0.4)' : 'rgba(187, 62, 66, 0.3)'}`,
              }
            }}
          >
            {error}
          </MessageBar>
        )}

        {success && (
          <MessageBar 
            messageBarType={MessageBarType.success}
            styles={{
              root: {
                background: isDarkMode ? 'rgba(115, 171, 96, 0.15)' : 'rgba(115, 171, 96, 0.08)',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(115, 171, 96, 0.4)' : 'rgba(115, 171, 96, 0.3)'}`,
              }
            }}
          >
            {success}
          </MessageBar>
        )}

        {savingProgress && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 8,
            background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
            border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.25)'}`,
            marginBottom: 20,
          }}>
            <div style={{
              width: 20,
              height: 20,
              border: `3px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)'}`,
              borderTopColor: isDarkMode ? colours.blue : colours.highlight,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <Text style={{
              fontSize: 13,
              fontWeight: 500,
              color: isDarkMode ? '#E5E7EB' : '#061733',
            }}>
              {savingProgress}
            </Text>
          </div>
        )}

        {/* Contact Information Section */}
        <div style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Contact Information</Text>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <TextField
              label="First Name"
              value={formData.firstName}
              onChange={(_, value) => handleFieldChange('firstName', value || '')}
              disabled={isSaving}
              required
              styles={{ root: { flex: 1 }, ...fieldStyles }}
            />
            <TextField
              label="Last Name"
              value={formData.lastName}
              onChange={(_, value) => handleFieldChange('lastName', value || '')}
              disabled={isSaving}
              required
              styles={{ root: { flex: 1 }, ...fieldStyles }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <TextField
              label="Email"
              value={formData.email}
              onChange={(_, value) => handleFieldChange('email', value || '')}
              disabled={isSaving}
              required
              type="email"
              styles={{ root: { flex: 1 }, ...fieldStyles }}
            />
            <TextField
              label="Phone"
              value={formData.phone}
              onChange={(_, value) => handleFieldChange('phone', value || '')}
              disabled={isSaving}
              required
              placeholder="07123 456789"
              styles={{ root: { flex: 1 }, ...fieldStyles }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Dropdown
                label="Point of Contact"
                selectedKey={formData.rep || undefined}
                onChange={(_, option) => handleFieldChange('rep', option?.key as string || '')}
                options={teamMemberOptions}
                disabled={isSaving}
                required
                placeholder="Select team member..."
                styles={{ root: { width: '100%' }, ...dropdownStyles }}
              />
              {formData.rep && (
                <Text 
                  variant="small" 
                  style={{ 
                    marginTop: -2,
                    fontSize: 11, 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontStyle: 'italic'
                  }}
                >
                  Will insert as: "{formData.rep}"
                </Text>
              )}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Dropdown
                label="Source"
                selectedKey={formData.source || undefined}
                onChange={(_, option) => handleFieldChange('source', option?.key as string || '')}
                options={getSourceOptions(userEmail)}
                disabled={isSaving}
                required
                placeholder="Select source..."
                styles={{ root: { width: '100%' }, ...dropdownStyles }}
              />
              {formData.source && (
                <Text 
                  variant="small" 
                  style={{ 
                    marginTop: -2,
                    fontSize: 11, 
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)',
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontStyle: 'italic'
                  }}
                >
                  Will insert as: "{formData.source.toLowerCase()}"
                </Text>
              )}
            </div>
          </div>

          {formData.source.toLowerCase() === 'referral' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <TextField
                label="Referring Individual"
                value={formData.contactReferrer}
                onChange={(_, value) => handleFieldChange('contactReferrer', value || '')}
                disabled={isSaving}
                placeholder="Name of person"
                styles={{ root: { flex: 1 }, ...fieldStyles }}
              />
              <TextField
                label="Referring Company"
                value={formData.companyReferrer}
                onChange={(_, value) => handleFieldChange('companyReferrer', value || '')}
                disabled={isSaving}
                placeholder="Company name"
                styles={{ root: { flex: 1 }, ...fieldStyles }}
              />
            </div>
          )}
        </div>

        {/* Enquiry Information Section */}
        <div style={sectionStyle}>
          <Text style={sectionHeaderStyle}>Enquiry Information</Text>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <Dropdown
              label="Area of Work"
              selectedKey={formData.aow || undefined}
              onChange={(_, option) => handleFieldChange('aow', option?.key as string || '')}
              options={areaOfWorkOptions}
              disabled={isSaving}
              required
              placeholder="Select area..."
              styles={{ root: { flex: 1 }, ...dropdownStyles }}
            />
            <Dropdown
              label="Method of Contact"
              selectedKey={formData.moc || undefined}
              onChange={(_, option) => handleFieldChange('moc', option?.key as string || '')}
              options={methodOfContactOptions}
              disabled={isSaving}
              required
              placeholder="Select method..."
              styles={{ root: { flex: 1 }, ...dropdownStyles }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <TextField
              label="Type of Work"
              value={formData.tow}
              onChange={(_, value) => handleFieldChange('tow', value || '')}
              disabled={isSaving}
              placeholder="Optional"
              styles={{ root: { flex: 1 }, ...fieldStyles }}
            />
            <Dropdown
              label="Value Band"
              selectedKey={formData.value || undefined}
              onChange={(_, option) => handleFieldChange('value', option?.key as string || '')}
              options={valueBandOptions}
              disabled={isSaving}
              required
              placeholder="Select value..."
              styles={{ root: { flex: 1 }, ...dropdownStyles }}
            />
          </div>

          <TextField
            label="Notes"
            value={formData.notes}
            onChange={(_, value) => handleFieldChange('notes', value || '')}
            disabled={isSaving}
            multiline
            rows={2}
            placeholder="Optional notes..."
            styles={fieldStyles}
          />
        </div>

        {/* Info Box */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '14px 16px',
          borderRadius: 8,
          background: isDarkMode 
            ? 'rgba(54, 144, 206, 0.08)' 
            : 'rgba(54, 144, 206, 0.06)',
          border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
          marginTop: 8,
        }}>
          <div style={{ 
            marginTop: 2,
            color: isDarkMode ? colours.blue : colours.highlight,
            fontSize: 16,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 16v-4m0-4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <Text style={{ 
              fontSize: 13,
              fontWeight: 600,
              color: isDarkMode ? '#E5E7EB' : '#061733',
              marginBottom: 4,
              display: 'block'
            }}>
              What will be created
            </Text>
            <Text style={{ 
              fontSize: 12,
              lineHeight: '18px',
              color: isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(51, 65, 85, 0.75)',
            }}>
              A new contact record will be created with the information provided above. An enquiry will be automatically generated and linked to this contact's record.
            </Text>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={buttonRowStyle}>
          <DefaultButton
            text="Cancel"
            onClick={handleClose}
            disabled={isSaving}
            styles={cancelButtonStyles}
          />
          <PrimaryButton
            onClick={handleSubmit}
            disabled={isSaving}
            styles={primaryButtonStyles}
          >
            {isSaving ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 14,
                  height: 14,
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTopColor: '#FFFFFF',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                }} />
                <span>Creating...</span>
              </div>
            ) : (
              'Create Contact'
            )}
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  );
};

export default CreateContactModal;
