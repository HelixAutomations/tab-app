// src/CustomForms/AnnualLeaveHistory.tsx
// Streamlined leave history view with delete functionality

import React, { useState, useMemo, useCallback } from 'react';
import { Stack, Text, IconButton, TooltipHost, Spinner, SpinnerSize, Dialog, DialogType, DialogFooter, DefaultButton, PrimaryButton, Checkbox, MessageBar, MessageBarType } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { format } from 'date-fns';
import { AnnualLeaveRecord } from '../app/functionality/types';

interface AnnualLeaveHistoryProps {
  leaveRecords: AnnualLeaveRecord[];
  userInitials: string;
  onLeaveDeleted?: () => void;
}

const getStatusColor = (status: string, isDarkMode: boolean): string => {
  const statusLower = status.toLowerCase();
  const colors: Record<string, string> = {
    'approved': isDarkMode ? colours.green : '#059669',
    'pending': isDarkMode ? colours.yellow : '#d97706',
    'requested': isDarkMode ? colours.yellow : '#d97706',
    'rejected': isDarkMode ? colours.cta : '#dc2626',
    'booked': isDarkMode ? colours.green : '#059669',
  };
  return colors[statusLower] || (isDarkMode ? colours.dark.subText : colours.greyText);
};

export const AnnualLeaveHistory: React.FC<AnnualLeaveHistoryProps> = ({
  leaveRecords,
  userInitials,
  onLeaveDeleted
}) => {
  const { isDarkMode } = useTheme();
  const [deleteTarget, setDeleteTarget] = useState<AnnualLeaveRecord | null>(null);
  const [deleteFromClio, setDeleteFromClio] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter and sort leave records for current user
  const userLeave = useMemo(() => {
    return leaveRecords
      .filter(record => record.person.toLowerCase() === userInitials.toLowerCase())
      .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  }, [leaveRecords, userInitials]);

  const handleDeleteLeave = useCallback(async () => {
    if (!deleteTarget?.request_id) {
      setMessage({ type: 'error', text: 'Cannot delete: No request ID found.' });
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/attendance/annual-leave/${deleteTarget.request_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteFromClio }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete leave request');
      }

      setDeleteTarget(null);
      setMessage({ 
        type: 'success', 
        text: `✅ Leave deleted${result.clioDeleted ? ' (also removed from Clio)' : ''}.` 
      });

      if (onLeaveDeleted) {
        onLeaveDeleted();
      }
    } catch (error) {
      console.error('Error deleting leave:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to delete leave request' 
      });
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, deleteFromClio, onLeaveDeleted]);

  const canDelete = (record: AnnualLeaveRecord): boolean => {
    const status = record.status?.toLowerCase() || '';
    return ['pending', 'requested', 'approved', 'booked'].includes(status);
  };

  if (userLeave.length === 0) {
    return (
      <div style={{
        padding: '2rem',
        textAlign: 'center',
        color: isDarkMode ? colours.dark.subText : colours.light.subText
      }}>
        <Text>No leave history available.</Text>
      </div>
    );
  }

  return (
    <>
      {message && (
        <MessageBar
          messageBarType={message.type === 'success' ? MessageBarType.success : MessageBarType.error}
          onDismiss={() => setMessage(null)}
          styles={{
            root: {
              marginBottom: '16px',
              backgroundColor: message.type === 'success' 
                ? (isDarkMode ? 'rgba(115, 171, 96, 0.1)' : 'rgba(16, 185, 129, 0.1)')
                : (isDarkMode ? 'rgba(214, 85, 65, 0.1)' : 'rgba(220, 38, 38, 0.1)'),
              borderRadius: 0,
            }
          }}
        >
          {message.text}
        </MessageBar>
      )}

      <Stack tokens={{ childrenGap: 12 }}>
        {userLeave.map((record, index) => (
          <div
            key={record.id || index}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(248, 250, 252, 0.5)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(0, 0, 0, 0.06)'}`,
              borderLeft: `3px solid ${getStatusColor(record.status || '', isDarkMode)}`,
              borderRadius: 0,
              transition: '0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.8)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = isDarkMode ? 'rgba(30, 41, 59, 0.3)' : 'rgba(248, 250, 252, 0.5)';
            }}
          >
            <div style={{ flex: 1 }}>
              <Stack horizontal tokens={{ childrenGap: 16 }} verticalAlign="center">
                <div style={{ minWidth: '180px' }}>
                  <Text style={{ 
                    fontSize: '13px', 
                    fontWeight: 600,
                    color: isDarkMode ? colours.dark.text : colours.light.text 
                  }}>
                    {format(new Date(record.start_date), 'd MMM')} - {format(new Date(record.end_date), 'd MMM yyyy')}
                  </Text>
                </div>

                <div style={{ minWidth: '60px', textAlign: 'center' }}>
                  <Text style={{ 
                    fontSize: '13px', 
                    fontWeight: 600, 
                    color: colours.accent 
                  }}>
                    {record.days_taken ?? 'N/A'} days
                  </Text>
                </div>

                <div style={{ minWidth: '90px' }}>
                  <Text style={{ 
                    fontSize: '11px', 
                    fontWeight: 600,
                    color: getStatusColor(record.status || '', isDarkMode),
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {record.status || 'Unknown'}
                  </Text>
                </div>

                <div style={{ minWidth: '70px' }}>
                  <Text style={{ 
                    fontSize: '12px', 
                    color: isDarkMode ? colours.dark.subText : colours.light.subText 
                  }}>
                    {record.leave_type || 'Standard'}
                  </Text>
                </div>

                {record.reason && (
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Text style={{ 
                      fontSize: '12px', 
                      color: isDarkMode ? colours.dark.subText : colours.light.subText,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {record.reason}
                    </Text>
                  </div>
                )}
              </Stack>

              {record.status?.toLowerCase() === 'rejected' && record.rejection_notes && (
                <Text style={{
                  fontSize: '11px',
                  color: colours.cta,
                  fontStyle: 'italic',
                  marginTop: '4px',
                  display: 'block'
                }}>
                  Reason: {record.rejection_notes}
                </Text>
              )}
            </div>

            {canDelete(record) && (
              <TooltipHost content="Delete this leave request">
                <IconButton
                  iconProps={{ iconName: 'Delete' }}
                  onClick={() => setDeleteTarget(record)}
                  styles={{
                    root: {
                      color: colours.cta,
                      height: '32px',
                      width: '32px',
                    },
                    rootHovered: {
                      color: isDarkMode ? '#ff6b6b' : '#b91c1c',
                      backgroundColor: 'rgba(214, 85, 65, 0.1)',
                    }
                  }}
                />
              </TooltipHost>
            )}
          </div>
        ))}
      </Stack>

      {/* Delete Confirmation Dialog */}
      <Dialog
        hidden={!deleteTarget}
        onDismiss={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
          }
        }}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Delete Leave Request',
          subText: deleteTarget 
            ? `Are you sure you want to delete your leave from ${format(new Date(deleteTarget.start_date), 'd MMM')} to ${format(new Date(deleteTarget.end_date), 'd MMM yyyy')}?`
            : '',
          styles: {
            title: {
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontWeight: 600,
            },
            subText: {
              color: isDarkMode ? 'rgba(255, 255, 255, 0.85)' : colours.light.subText,
            }
          }
        }}
        modalProps={{
          isBlocking: isDeleting,
          styles: {
            main: {
              backgroundColor: isDarkMode ? colours.dark.sectionBackground : '#ffffff',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              borderRadius: '8px',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(0, 0, 0, 0.1)'}`,
            }
          }
        }}
      >
        <Stack tokens={{ childrenGap: 16 }} style={{ padding: '0 24px 24px' }}>
          {deleteTarget?.status?.toLowerCase() === 'booked' && (
            <div style={{
              padding: '12px',
              backgroundColor: isDarkMode ? 'rgba(214, 176, 70, 0.1)' : 'rgba(217, 119, 6, 0.1)',
              border: isDarkMode ? '1px solid rgba(214, 176, 70, 0.3)' : '1px solid rgba(217, 119, 6, 0.3)',
              borderRadius: '4px',
            }}>
              <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                <Text style={{ fontSize: '12px', color: isDarkMode ? colours.yellow : '#d97706' }}>
                  ⚠️ This leave has been booked and added to Clio calendar.
                </Text>
              </Stack>
            </div>
          )}

          <Checkbox
            label="Also delete from Clio calendar"
            checked={deleteFromClio}
            onChange={(_, checked) => setDeleteFromClio(checked ?? true)}
            disabled={isDeleting}
            styles={{
              text: { 
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '13px'
              }
            }}
          />
        </Stack>

        <DialogFooter>
          <DefaultButton 
            onClick={() => setDeleteTarget(null)} 
            text="Cancel" 
            disabled={isDeleting}
            styles={{
              root: {
                backgroundColor: 'transparent',
                border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.3)' : '1px solid rgba(0, 0, 0, 0.2)',
              },
              rootHovered: {
                backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)',
              },
              label: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
              }
            }}
          />
          <PrimaryButton 
            onClick={handleDeleteLeave} 
            text={isDeleting ? 'Deleting...' : 'Delete'}
            disabled={isDeleting}
            styles={{
              root: {
                backgroundColor: colours.cta,
                border: 'none',
              },
              rootHovered: {
                backgroundColor: isDarkMode ? '#ff6b6b' : '#b91c1c',
              }
            }}
          >
            {isDeleting && <Spinner size={SpinnerSize.xSmall} style={{ marginRight: '8px' }} />}
          </PrimaryButton>
        </DialogFooter>
      </Dialog>
    </>
  );
};
