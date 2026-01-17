import React, { useEffect, useState } from 'react';
import {
  Stack,
  Text,
  Icon,
  IconButton,
  TooltipHost,
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  DefaultButton,
  TextField,
  Dropdown,
  IDropdownOption,
  mergeStyles,
} from '@fluentui/react';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import {
  getFormSectionHeaderStyle,
  getFormSectionStyle,
  getInfoBoxTextStyle,
} from './formStyles';
import { colours } from '../../app/styles/colours';

type LedgerItem = {
  type: 'idea' | 'problem';
  id: number;
  created_at: string;
  submitted_by: string | null;
  title: string;
  status: string | null;
};

type LedgerType = 'idea' | 'problem';

type TechTicketsLedgerProps = {
  isDarkMode: boolean;
  refreshKey?: number;
  type: LedgerType;
  title: string;
  accentColor: string;
};

function getStatusMeta(status: string | null | undefined): { label: string; tone: 'neutral' | 'success' | 'warning' } {
  const s = (status || '').toLowerCase();
  if (!s || s === 'submitted') return { label: 'Pending review', tone: 'neutral' };
  if (s === 'asana_created') return { label: 'Logged', tone: 'success' };
  if (s === 'asana_failed') return { label: 'Logged (Asana failed)', tone: 'warning' };
  return { label: status || 'Pending review', tone: 'neutral' };
}

function formatType(type: LedgerItem['type']): string {
  return type === 'idea' ? 'Idea' : 'Problem';
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export default function TechTicketsLedger(props: TechTicketsLedgerProps) {
  const { isDarkMode, refreshKey, type, title, accentColor } = props;

  const [items, setItems] = useState<LedgerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<LedgerItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<LedgerItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const textPrimary = isDarkMode ? '#f8fafc' : '#0f172a';
  const textMuted = isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)';
  const rowBg = isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
  const rowHover = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const rowBorder = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const countChipBorder = isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)';
  const countChipBg = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)';

  // Dark mode dialog styling
  const dialogContainerClass = mergeStyles({
    '& .ms-Dialog-main': {
      backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
      color: isDarkMode ? colours.dark.text : colours.light.text,
      borderRadius: 0,
      border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid rgba(15, 23, 42, 0.08)',
    },
    '& .ms-Dialog-title': {
      color: isDarkMode ? colours.dark.text : colours.light.text,
      fontWeight: 600,
    },
    '& .ms-Dialog-subText': {
      color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)',
    },
  });

  const statusOptions: IDropdownOption[] = [
    { key: 'submitted', text: 'Pending review' },
    { key: 'asana_created', text: 'Logged' },
    { key: 'asana_failed', text: 'Logged (Asana failed)' },
  ];

  const rowStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    background: rowBg,
    border: `1px solid ${rowBorder}`,
    fontSize: '11px',
    transition: 'background 0.15s ease',
  };

  const statusStyles = (tone: 'neutral' | 'success' | 'warning') => {
    const palette = {
      neutral: {
        bg: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.04)',
        color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(15, 23, 42, 0.7)',
        border: isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(15, 23, 42, 0.12)',
      },
      success: {
        bg: isDarkMode ? 'rgba(74, 222, 128, 0.12)' : 'rgba(74, 222, 128, 0.08)',
        color: isDarkMode ? '#4ade80' : '#15803d',
        border: isDarkMode ? 'rgba(74, 222, 128, 0.35)' : 'rgba(74, 222, 128, 0.25)',
      },
      warning: {
        bg: isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.08)',
        color: isDarkMode ? '#f87171' : '#b91c1c',
        border: isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(248, 113, 113, 0.25)',
      },
    }[tone];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2px 10px',
      borderRadius: 0,
      fontSize: '9px',
      fontWeight: 600,
      background: palette.bg,
      color: palette.color,
      border: `1px solid ${palette.border}`,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.4px',
    };
  };

  const openEdit = (item: LedgerItem) => {
    setEditingItem(item);
    setEditTitle(item.title || '');
    setEditStatus(item.status || 'submitted');
  };

  const handleSave = async () => {
    if (!editingItem) return;
    setIsSaving(true);
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/tech-tickets/item/${editingItem.type}/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          status: editStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update ticket');
      }

      setItems(prev => prev.map(item => (
        item.id === editingItem.id
          ? { ...item, title: editTitle.trim() || item.title, status: editStatus || item.status }
          : item
      )));
      setEditingItem(null);
      setEditTitle('');
      setEditStatus('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update ticket');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      const baseUrl = getProxyBaseUrl();
      const response = await fetch(`${baseUrl}/api/tech-tickets/item/${deletingItem.type}/${deletingItem.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete ticket');
      }

      setDeletingItem(null);
      setItems(prev => prev.filter(item => item.id !== deletingItem.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete ticket');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const baseUrl = getProxyBaseUrl();
        const response = await fetch(`${baseUrl}/api/tech-tickets/ledger?limit=20&type=${encodeURIComponent(type)}`);
        if (!response.ok) {
          throw new Error(`Failed to load ledger (${response.status})`);
        }

        const data = (await response.json().catch(() => ({ items: [] }))) as { items?: LedgerItem[] };
        const nextItems = Array.isArray(data.items) ? data.items : [];

        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load ledger');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, type]);

  return (
    <div style={getFormSectionStyle(isDarkMode, accentColor)}>
      <div style={getFormSectionHeaderStyle(isDarkMode, accentColor)}>
        <Icon iconName="BulletedList" style={{ fontSize: 16 }} />
        {title}
      </div>

      <Stack tokens={{ childrenGap: 8 }}>
        <Text style={getInfoBoxTextStyle(isDarkMode)}>
          This is a record of recent submissions. Items are reviewed and approved before work is scheduled.
        </Text>

        {error ? (
          <Text style={getInfoBoxTextStyle(isDarkMode)}>{error}</Text>
        ) : null}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: textMuted,
              padding: '2px 6px',
              borderRadius: 3,
              border: `1px solid ${countChipBorder}`,
              background: countChipBg
            }}>
              {isLoading ? (
                <span style={{ display: 'inline-block', width: '26px', height: '8px', borderRadius: 2, background: isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.2)' }} />
              ) : (
                `${items.length} total`
              )}
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 600,
              color: textMuted,
              padding: '2px 6px',
              borderRadius: 3,
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.35)' : 'rgba(54, 144, 206, 0.25)'}`,
              background: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)'
            }}>
              Latest submissions
            </span>
          </div>

          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <div key={`loading-${idx}`} style={{
                ...rowStyle,
                color: textMuted,
              }}>
                <div style={{ height: 12, background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.2)' }} />
                <div style={{ height: 12, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)' }} />
                <div style={{ height: 12, background: isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.18)' }} />
                <div style={{ height: 18, borderRadius: 999, background: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)' }} />
              </div>
            ))
          ) : items.length === 0 ? (
            <div style={{ padding: '16px 12px' }}>
              <Text style={getInfoBoxTextStyle(isDarkMode)}>
                No submissions yet.
              </Text>
            </div>
          ) : (
            items.map((item) => {
              const statusMeta = getStatusMeta(item.status);
              return (
                <div key={`${item.type}-${item.id}`} style={{
                  ...rowStyle,
                  color: textPrimary,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = rowHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = rowBg;
                }}>
                  <div style={{ width: '3px', height: '28px', background: accentColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon iconName={item.type === 'problem' ? 'Bug' : 'Lightbulb'} style={{ fontSize: 12, color: accentColor }} />
                      <Text style={{ color: textPrimary, fontSize: '11px', fontWeight: 600 }}>{item.title || ''}</Text>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '2px' }}>
                      <Text style={{ color: textMuted, fontSize: '10px' }}>{item.submitted_by || '—'}</Text>
                      <Text style={{ color: textMuted, fontSize: '10px' }}>{item.created_at ? formatWhen(item.created_at) : ''}</Text>
                    </div>
                  </div>
                  <span style={statusStyles(statusMeta.tone)}>{statusMeta.label}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <TooltipHost content="Edit">
                      <IconButton
                        iconProps={{ iconName: 'Edit', style: { fontSize: '11px' } }}
                        onClick={() => openEdit(item)}
                        styles={{
                          root: {
                            width: 22,
                            height: 22,
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.04)',
                            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.3)' : 'rgba(15, 23, 42, 0.12)'}`,
                            borderRadius: 0,
                            transition: 'background 0.15s, border-color 0.15s, color 0.15s'
                          },
                          rootHovered: {
                            background: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(15, 23, 42, 0.08)',
                            borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.45)' : 'rgba(15, 23, 42, 0.2)'
                          },
                          icon: { color: textMuted }
                        }}
                      />
                    </TooltipHost>
                    <TooltipHost content="Delete">
                      <IconButton
                        iconProps={{ iconName: 'Delete', style: { fontSize: '11px' } }}
                        onClick={() => setDeletingItem(item)}
                        styles={{
                          root: {
                            width: 22,
                            height: 22,
                            background: isDarkMode ? 'rgba(248, 113, 113, 0.12)' : 'rgba(248, 113, 113, 0.08)',
                            border: `1px solid ${isDarkMode ? 'rgba(248, 113, 113, 0.35)' : 'rgba(248, 113, 113, 0.25)'}`,
                            borderRadius: 0,
                            transition: 'background 0.15s, border-color 0.15s, color 0.15s'
                          },
                          rootHovered: {
                            background: isDarkMode ? 'rgba(248, 113, 113, 0.2)' : 'rgba(248, 113, 113, 0.14)',
                            borderColor: isDarkMode ? 'rgba(248, 113, 113, 0.5)' : 'rgba(248, 113, 113, 0.4)'
                          },
                          icon: { color: '#D65541' }
                        }}
                      />
                    </TooltipHost>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Stack>

      <Dialog
        hidden={!editingItem}
        dialogContentProps={{
          type: DialogType.normal,
          title: editingItem ? (editingItem.type === 'problem' ? 'Edit problem' : 'Edit idea') : 'Edit ticket',
          className: dialogContainerClass,
        }}
        modalProps={{
          isBlocking: false,
          styles: {
            main: {
              backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              borderRadius: 0,
              border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid rgba(15, 23, 42, 0.08)',
            },
          },
        }}
        onDismiss={() => !isSaving && setEditingItem(null)}
        minWidth={340}
      >
        <Stack tokens={{ childrenGap: 12 }}>
          <TextField
            label={editingItem?.type === 'problem' ? 'Summary' : 'Title'}
            value={editTitle}
            onChange={(_, val) => setEditTitle(val || '')}
            styles={{
              root: { marginTop: 8 },
              fieldGroup: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)'}`,
                borderRadius: 0,
              },
              field: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
              subComponentStyles: {
                label: {
                  root: {
                    color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)',
                    fontWeight: 500,
                    fontSize: '12px',
                  },
                },
              },
            }}
          />
          <Dropdown
            label="Status"
            options={statusOptions}
            selectedKey={editStatus || 'submitted'}
            onChange={(_, option) => setEditStatus(String(option?.key || 'submitted'))}
            styles={{
              root: {},
              title: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)'}`,
                borderRadius: 0,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
              label: {
                color: isDarkMode ? 'rgba(148, 163, 184, 0.9)' : 'rgba(100, 116, 139, 0.95)',
                fontWeight: 500,
                fontSize: '12px',
              },
              caretDownWrapper: {
                color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.7)',
              },
            }}
          />
        </Stack>
        <DialogFooter>
          <PrimaryButton
            text={isSaving ? 'Saving...' : 'Save'}
            onClick={handleSave}
            disabled={isSaving}
            styles={{
              root: {
                backgroundColor: colours.cta,
                border: 'none',
                borderRadius: 0,
              },
              rootHovered: {
                backgroundColor: '#c74a3a',
              },
            }}
          />
          <DefaultButton
            text="Cancel"
            onClick={() => setEditingItem(null)}
            disabled={isSaving}
            styles={{
              root: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15, 23, 42, 0.04)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)'}`,
                borderRadius: 0,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
              rootHovered: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(15, 23, 42, 0.08)',
              },
            }}
          />
        </DialogFooter>
      </Dialog>

      <Dialog
        hidden={!deletingItem}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Delete submission',
          subText: deletingItem ? `Delete “${deletingItem.title}”? This cannot be undone.` : '',
          className: dialogContainerClass,
        }}
        modalProps={{
          isBlocking: false,
          styles: {
            main: {
              backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
              color: isDarkMode ? colours.dark.text : colours.light.text,
              borderRadius: 0,
              border: isDarkMode ? '1px solid rgba(148, 163, 184, 0.15)' : '1px solid rgba(15, 23, 42, 0.08)',
            },
          },
        }}
        onDismiss={() => !isDeleting && setDeletingItem(null)}
        minWidth={340}
      >
        <DialogFooter>
          <PrimaryButton
            text={isDeleting ? 'Deleting...' : 'Delete'}
            onClick={handleDelete}
            disabled={isDeleting}
            styles={{
              root: {
                backgroundColor: colours.cta,
                border: 'none',
                borderRadius: 0,
              },
              rootHovered: {
                backgroundColor: '#c74a3a',
              },
            }}
          />
          <DefaultButton
            text="Cancel"
            onClick={() => setDeletingItem(null)}
            disabled={isDeleting}
            styles={{
              root: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15, 23, 42, 0.04)',
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(15, 23, 42, 0.12)'}`,
                borderRadius: 0,
                color: isDarkMode ? colours.dark.text : colours.light.text,
              },
              rootHovered: {
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(15, 23, 42, 0.08)',
              },
            }}
          />
        </DialogFooter>
      </Dialog>
    </div>
  );
}

