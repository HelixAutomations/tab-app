import React, { useState, useCallback, useEffect } from 'react';
import { Modal, TextField, PrimaryButton, DefaultButton, Text, IconButton, Icon } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { Enquiry } from '../../app/functionality/types';

interface EditEnquiryModalProps {
  isOpen: boolean;
  enquiry: Enquiry | null;
  userEmail: string;
  onClose: () => void;
  onSave: (enquiryId: string, updates: Partial<Enquiry>) => Promise<void>;
}

/**
 * EditEnquiryModal
 * Modal for editing claimed enquiry details - only owner can edit
 */
const EditEnquiryModal: React.FC<EditEnquiryModalProps> = ({
  isOpen,
  enquiry,
  userEmail,
  onClose,
  onSave
}) => {
  const { isDarkMode } = useTheme();
  const [formData, setFormData] = useState({
    First_Name: '',
    Last_Name: '',
    Email: '',
    Value: '',
    Initial_first_call_notes: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check if current user owns this enquiry
  const isOwner = enquiry?.Point_of_Contact?.toLowerCase() === userEmail.toLowerCase();

  // Reset form when enquiry changes
  useEffect(() => {
    if (enquiry) {
      setFormData({
        First_Name: enquiry.First_Name || '',
        Last_Name: enquiry.Last_Name || '',
        Email: enquiry.Email || '',
        Value: enquiry.Value || '',
        Initial_first_call_notes: enquiry.Initial_first_call_notes || ''
      });
    }
    setError(null);
    setSuccess(null);
  }, [enquiry]);

  const handleFieldChange = useCallback((field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null); // Clear error when user starts typing
  }, []);

  const handleSave = useCallback(async () => {
    if (!enquiry || !isOwner) return;

    // Basic validation
    if (!formData.First_Name.trim() || !formData.Last_Name.trim()) {
      setError('First name and last name are required');
      return;
    }

    if (!formData.Email.trim()) {
      setError('Email is required');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.Email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      // Prepare updates - only include changed fields
      const updates: Partial<Enquiry> = {};
      if (formData.First_Name !== enquiry.First_Name) updates.First_Name = formData.First_Name.trim();
      if (formData.Last_Name !== enquiry.Last_Name) updates.Last_Name = formData.Last_Name.trim();
      if (formData.Email !== enquiry.Email) updates.Email = formData.Email.trim();
      if (formData.Value !== enquiry.Value) updates.Value = formData.Value.trim();
      if (formData.Initial_first_call_notes !== enquiry.Initial_first_call_notes) {
        updates.Initial_first_call_notes = formData.Initial_first_call_notes.trim();
      }

      if (Object.keys(updates).length === 0) {
        setError('No changes detected');
        return;
      }

      await onSave(enquiry.ID, updates);
      setSuccess('Enquiry updated successfully');
      
      // Close modal after brief success message
      setTimeout(() => {
        setSuccess(null);
        onClose();
      }, 1500);

    } catch (err) {
      console.error('Failed to save enquiry:', err);
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [enquiry, isOwner, formData, onSave, onClose]);

  if (!enquiry) return null;

  const modalStyles = {
    main: {
      background: isDarkMode ? '#1f2937' : '#ffffff',
      borderRadius: 12,
      border: `1px solid ${isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(203, 213, 225, 0.9)'}`,
      boxShadow: isDarkMode
        ? '0 20px 50px rgba(0,0,0,0.55)'
        : '0 20px 50px rgba(0,0,0,0.18)',
      padding: 0,
      maxWidth: 600,
      width: '90vw'
    }
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px 14px 24px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(226, 232, 240, 0.9)'}`,
    background: isDarkMode
      ? 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.01) 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
  };

  const contentStyle = {
    padding: '22px 24px 24px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16
  };

  const buttonRowStyle = {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
    paddingTop: 4
  };

  const fieldLabelStyle = {
    root: {
      fontSize: 12,
      fontWeight: 600,
      color: isDarkMode ? '#e5e7eb' : '#0f172a'
    }
  };

  const fieldGroupStyle = {
    borderColor: isDarkMode ? 'rgba(55, 65, 81, 0.95)' : 'rgba(203, 213, 225, 0.9)',
    background: isDarkMode ? 'rgba(55, 65, 81, 0.85)' : 'rgba(248, 250, 252, 0.95)',
    borderRadius: 6
  };

  const promptPalette = {
    warning: {
      bg: isDarkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(251, 191, 36, 0.08)',
      border: '#f59e0b',
      text: '#f59e0b',
      icon: 'Warning'
    },
    error: {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
      border: '#ef4444',
      text: '#ef4444',
      icon: 'StatusErrorFull'
    },
    success: {
      bg: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
      border: '#22c55e',
      text: '#22c55e',
      icon: 'Completed'
    },
    info: {
      bg: isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.06)',
      border: isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.22)',
      text: isDarkMode ? 'rgba(148, 163, 184, 0.85)' : 'rgba(100, 116, 139, 0.9)',
      icon: 'Info'
    }
  } as const;

  const renderPromptBanner = (
    type: keyof typeof promptPalette,
    title: string,
    message: string
  ) => {
    const colors = promptPalette[type];
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: colors.text, display: 'flex', alignItems: 'center' }}>
            <Icon iconName={colors.icon} style={{ fontSize: 12 }} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{title}</span>
            <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(226, 232, 240, 0.8)' : 'rgba(15, 23, 42, 0.78)' }}>{message}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onClose}
      isBlocking={isSaving}
      styles={{ main: modalStyles.main }}
    >
      <div style={headerStyle}>
        <Text variant="large" styles={{
          root: {
            fontWeight: 600,
            color: isDarkMode ? '#e5e7eb' : '#0f172a'
          }
        }}>
          Edit Enquiry
        </Text>
        <IconButton
          iconProps={{ iconName: 'Cancel' }}
          onClick={onClose}
          styles={{
            root: {
              color: isDarkMode ? 'rgba(156, 163, 175, 0.9)' : 'rgba(100, 116, 139, 0.9)',
              borderRadius: 6
            }
          }}
        />
      </div>

      <div style={contentStyle}>
        {!isOwner && renderPromptBanner('warning', 'Access', 'Only the claimant can edit this enquiry.')}

        {error && renderPromptBanner('error', 'Update failed', error)}

        {success && renderPromptBanner('success', 'Saved', success)}

        <Text variant="small" styles={{
          root: {
            color: isDarkMode ? 'rgba(148, 163, 184, 0.8)' : 'rgba(100, 116, 139, 0.9)'
          }
        }}>
          Enquiry ID: {enquiry.ID} • Claimed by: {enquiry.Point_of_Contact}
        </Text>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <TextField
            label="First Name"
            value={formData.First_Name}
            onChange={(_, value) => handleFieldChange('First_Name', value || '')}
            disabled={!isOwner || isSaving}
            required
            styles={{
              root: { flex: 1 },
              fieldGroup: fieldGroupStyle,
              field: { color: isDarkMode ? '#e5e7eb' : '#0f172a' },
              subComponentStyles: { label: fieldLabelStyle }
            }}
          />
          <TextField
            label="Last Name"
            value={formData.Last_Name}
            onChange={(_, value) => handleFieldChange('Last_Name', value || '')}
            disabled={!isOwner || isSaving}
            required
            styles={{
              root: { flex: 1 },
              fieldGroup: fieldGroupStyle,
              field: { color: isDarkMode ? '#e5e7eb' : '#0f172a' },
              subComponentStyles: { label: fieldLabelStyle }
            }}
          />
        </div>

        <TextField
          label="Email"
          value={formData.Email}
          onChange={(_, value) => handleFieldChange('Email', value || '')}
          disabled={!isOwner || isSaving}
          required
          type="email"
          styles={{
            fieldGroup: fieldGroupStyle,
            field: { color: isDarkMode ? '#e5e7eb' : '#0f172a' },
            subComponentStyles: { label: fieldLabelStyle }
          }}
        />

        <TextField
          label="Value"
          value={formData.Value}
          onChange={(_, value) => handleFieldChange('Value', value || '')}
          disabled={!isOwner || isSaving}
          placeholder="e.g. £10,000, $50k, etc."
          styles={{
            fieldGroup: fieldGroupStyle,
            field: { color: isDarkMode ? '#e5e7eb' : '#0f172a' },
            subComponentStyles: { label: fieldLabelStyle }
          }}
        />

        <TextField
          label="Notes"
          value={formData.Initial_first_call_notes}
          onChange={(_, value) => handleFieldChange('Initial_first_call_notes', value || '')}
          disabled={!isOwner || isSaving}
          multiline
          rows={4}
          placeholder="Initial call notes..."
          styles={{
            fieldGroup: fieldGroupStyle,
            field: { color: isDarkMode ? '#e5e7eb' : '#0f172a' },
            subComponentStyles: { label: fieldLabelStyle }
          }}
        />

        <div style={buttonRowStyle}>
          <DefaultButton
            text="Cancel"
            onClick={onClose}
            disabled={isSaving}
            styles={{
              root: {
                borderRadius: 6,
                border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(148, 163, 184, 0.9)'}`,
                background: 'transparent',
                color: isDarkMode ? '#e5e7eb' : '#0f172a'
              }
            }}
          />
          <PrimaryButton
            text={isSaving ? 'Saving...' : 'Save Changes'}
            onClick={handleSave}
            disabled={!isOwner || isSaving}
            styles={{
              root: {
                borderRadius: 6,
                background: isDarkMode ? '#3b82f6' : '#3b82f6'
              }
            }}
          />
        </div>
      </div>
    </Modal>
  );
};

export default EditEnquiryModal;
