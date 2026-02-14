// src/components/EntryGate.tsx
// Full-screen entry gate for non-Teams access: passcode → user selection
// Replaces legacy PasscodeDialog + UserSelectionDialog with unified modern flow
// Use ?web on localhost to test this gate locally

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { colours } from '../app/styles/colours';
import { useTheme } from '../app/functionality/ThemeContext';
import { TeamData } from '../app/functionality/types';

// ─── Types ─────────────────────────────────────────────────────────────

type EntryStep = 'passcode' | 'user-select' | 'loading';

interface UserOption {
  key: string;
  fullName: string;
  initials: string;
  email: string;
  areas: string;
  role: string;
}

interface EntryGateProps {
  isOpen: boolean;
  onUserSelected: (userKey: string) => void;
}

const REQUIRED_PASSCODE = '2011';

// ─── Helix Mark SVG ────────────────────────────────────────────────────

const HelixMark: React.FC<{ color: string; size?: number }> = ({ color, size = 24 }) => (
  <svg width={size} height={size * 1.75} viewBox="0 0 57.56 100" fill="none">
    <path fill={color} d="M57.56,13.1c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1C6.4,39.77,0,41.23,0,48.5v-13.1C0,28.13,6.4,26.68,11.19,24.74c4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.09h0Z" />
    <path fill={color} d="M57.56,38.84c0,7.27-7.6,10.19-11.59,11.64s-29.98,11.16-34.78,13.1c-4.8,1.94-11.19,3.4-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.46,11.59-4.37,11.59-11.64v13.09h0Z" />
    <path fill={color} d="M57.56,64.59c0,7.27-7.6,10.19-11.59,11.64-4,1.46-29.98,11.15-34.78,13.1-4.8,1.94-11.19,3.39-11.19,10.67v-13.1c0-7.27,6.4-8.73,11.19-10.67,4.8-1.94,30.78-11.64,34.78-13.1,4-1.45,11.59-4.37,11.59-11.64v13.1h0Z" />
  </svg>
);

// ─── Initials Avatar ───────────────────────────────────────────────────

const InitialsAvatar: React.FC<{
  initials: string;
  selected?: boolean;
  isDarkMode: boolean;
  size?: number;
}> = ({ initials, selected, isDarkMode, size = 40 }) => {
  const accent = isDarkMode ? '#7DD3FC' : '#3690CE';
  return (
  <div style={{
    width: size,
    height: size,
    borderRadius: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.35,
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    fontFamily: "'SF Mono', 'Consolas', monospace",
    background: selected
      ? accent
      : isDarkMode
        ? 'rgba(54,144,206,0.12)'
        : 'rgba(54,144,206,0.08)',
    color: selected
      ? '#fff'
      : accent,
    border: `1px solid ${selected
      ? 'transparent'
      : isDarkMode
        ? 'rgba(54,144,206,0.2)'
        : 'rgba(54,144,206,0.15)'}`,
    transition: 'all 0.12s ease',
    flexShrink: 0,
  }}>
    {initials}
  </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────

const EntryGate: React.FC<EntryGateProps> = ({ isOpen, onUserSelected }) => {
  const { isDarkMode } = useTheme();
  const [step, setStep] = useState<EntryStep>('passcode');
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [selectedUserKey, setSelectedUserKey] = useState<string | null>(null);
  const [teamData, setTeamData] = useState<TeamData[] | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [entering, setEntering] = useState(false);
  const passcodeInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus passcode input
  useEffect(() => {
    if (step === 'passcode' && passcodeInputRef.current) {
      passcodeInputRef.current.focus();
    }
  }, [step, isOpen]);

  // Auto-focus search when entering user-select
  useEffect(() => {
    if (step === 'user-select' && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 200);
    }
  }, [step]);

  // Fetch team data when entering user-select step
  useEffect(() => {
    if (step !== 'user-select' || teamData) return;

    const fetchTeam = async () => {
      setLoadingTeam(true);
      setFetchError(null);
      try {
        const res = await fetch('/api/team-data');
        if (!res.ok) throw new Error(res.statusText);
        const data: TeamData[] = await res.json();
        setTeamData(data);
      } catch (err) {
        console.error('Failed to load team data:', err);
        setFetchError('Unable to load team members.');
      } finally {
        setLoadingTeam(false);
      }
    };

    fetchTeam();
  }, [step, teamData]);

  // Build user options
  const userOptions: UserOption[] = useMemo(() => {
    if (!teamData) return [];
    return teamData
      .filter(u => String(u.status || '').toLowerCase() === 'active')
      .map(u => ({
        key: String(u.Initials || '').toLowerCase(),
        fullName: u['Full Name'] || `${u.First || ''} ${u.Last || ''}`.trim(),
        initials: u.Initials || '??',
        email: u.Email || '',
        areas: u.AOW || '',
        role: u.Role || '',
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [teamData]);

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return userOptions;
    const q = searchQuery.toLowerCase();
    return userOptions.filter(u =>
      u.fullName.toLowerCase().includes(q) ||
      u.initials.toLowerCase().includes(q) ||
      u.areas.toLowerCase().includes(q)
    );
  }, [userOptions, searchQuery]);

  const selectedUser = userOptions.find(u => u.key === selectedUserKey);

  // ─── Handlers ──────────────────────────────────────────────────────

  const handlePasscodeSubmit = useCallback(() => {
    if (passcode.trim() === REQUIRED_PASSCODE) {
      setPasscodeError(null);
      setStep('user-select');
    } else {
      setPasscodeError('Incorrect passcode');
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setPasscode('');
      passcodeInputRef.current?.focus();
    }
  }, [passcode]);

  const handlePasscodeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && passcode) handlePasscodeSubmit();
  }, [passcode, handlePasscodeSubmit]);

  const handleUserClick = useCallback((key: string) => {
    setSelectedUserKey(prev => prev === key ? null : key);
  }, []);

  const handleConfirmUser = useCallback(() => {
    if (!selectedUserKey) return;
    setEntering(true);
    setTimeout(() => onUserSelected(selectedUserKey), 600);
  }, [selectedUserKey, onUserSelected]);

  // Enter on keyboard when user selected
  useEffect(() => {
    if (step !== 'user-select') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selectedUserKey) handleConfirmUser();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, selectedUserKey, handleConfirmUser]);

  if (!isOpen) return null;

  // ─── Shared Styles ─────────────────────────────────────────────────

  const bg = isDarkMode ? colours.dark.background : colours.light.background;
  const cardBg = isDarkMode
    ? 'rgba(11, 30, 55, 0.95)'
    : 'rgba(255, 255, 255, 0.95)';
  const textColor = isDarkMode ? '#F1F5F9' : '#1E293B';
  const subTextColor = isDarkMode ? '#94A3B8' : '#64748B';
  const borderColor = isDarkMode ? 'rgba(125,211,252,0.2)' : 'rgba(148,163,184,0.25)';
  const innerBorder = isDarkMode ? 'rgba(125,211,252,0.12)' : 'rgba(148,163,184,0.18)';
  const surfaceBg = isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#F8FAFC';
  const accent = isDarkMode ? '#7DD3FC' : '#3690CE';
  const inputBg = isDarkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(244, 244, 246, 0.8)';

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: bg,
      zIndex: 9999,
      fontFamily: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      opacity: entering ? 0 : 1,
      transform: entering ? 'scale(1.02)' : 'scale(1)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
    }}>
      {/* Ambient background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: isDarkMode
          ? 'radial-gradient(ellipse at 30% 20%, rgba(54,144,206,0.03) 0%, transparent 60%)'
          : 'radial-gradient(ellipse at 30% 20%, rgba(54,144,206,0.02) 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        width: step === 'user-select' ? 480 : 400,
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        background: cardBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 2,
        border: `1px solid ${borderColor}`,
        boxShadow: isDarkMode
          ? '0 4px 16px rgba(0,0,0,0.3)'
          : '0 4px 16px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
      }}>
        {/* Accent bar */}
        <div style={{
          height: 3,
          background: accent,
          flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          padding: '28px 32px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 2,
            background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            border: `1px solid ${innerBorder}`,
            flexShrink: 0,
          }}>
            <HelixMark color={isDarkMode ? '#e2e8f0' : '#061733'} size={20} />
          </div>
          <div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: textColor,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}>
              Helix Hub
            </div>
            <div style={{
              fontSize: 12,
              fontWeight: 500,
              color: subTextColor,
              marginTop: 2,
            }}>
              {step === 'passcode' ? 'Restricted access' : 'Select your profile'}
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{
          padding: '16px 32px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}>
          {['passcode', 'user-select'].map((s, i) => (
            <React.Fragment key={s}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: step === s
                  ? accent
                  : (step === 'user-select' && s === 'passcode')
                    ? accent
                    : isDarkMode ? '#334155' : '#cbd5e1',
                opacity: step === s ? 1 : 0.5,
                transition: 'all 0.2s ease',
              }} />
              {i === 0 && (
                <div style={{
                  width: 24,
                  height: 1,
                  background: step === 'user-select'
                    ? accent
                    : isDarkMode ? '#334155' : '#cbd5e1',
                  opacity: step === 'user-select' ? 0.5 : 0.2,
                  transition: 'all 0.2s ease',
                }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Content */}
        <div style={{
          padding: '20px 32px 28px',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* ── Passcode Step ──────────────────────────────────────── */}
          {step === 'passcode' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              animation: 'entryFadeIn 0.3s ease',
            }}>
              <div style={{
                fontSize: 13,
                color: subTextColor,
                lineHeight: 1.6,
              }}>
                Enter the team passcode to continue.
              </div>

              {/* Passcode input */}
              <div style={{ position: 'relative' }}>
                <input
                  ref={passcodeInputRef}
                  type="password"
                  value={passcode}
                  onChange={e => { setPasscode(e.target.value); setPasscodeError(null); }}
                  onKeyDown={handlePasscodeKeyDown}
                  placeholder="Passcode"
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: 14,
                    fontFamily: "'SF Mono', 'Consolas', monospace",
                    fontWeight: 500,
                    letterSpacing: '4px',
                    textAlign: 'center',
                    background: inputBg,
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${passcodeError
                      ? colours.cta
                      : isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(148,163,184,0.2)'}`,
                    borderRadius: 2,
                    color: textColor,
                    outline: 'none',
                    transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
                    boxSizing: 'border-box',
                    animation: shake ? 'entryShake 0.4s ease' : undefined,
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = colours.blue;
                    e.currentTarget.style.boxShadow = `0 0 0 3px rgba(54,144,206,0.15)`;
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = passcodeError
                      ? colours.cta
                      : isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(148,163,184,0.2)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                {passcodeError && (
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: colours.cta,
                    marginTop: 8,
                    textAlign: 'center',
                  }}>
                    {passcodeError}
                  </div>
                )}
              </div>

              {/* Unlock button */}
              <button
                onClick={handlePasscodeSubmit}
                disabled={!passcode}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  letterSpacing: '0.5px',
                  border: 'none',
                  borderRadius: 2,
                  cursor: passcode ? 'pointer' : 'default',
                  background: passcode
                    ? accent
                    : isDarkMode ? '#1e293b' : '#e2e8f0',
                  color: passcode ? '#fff' : subTextColor,
                  transition: 'all 0.12s ease',
                  opacity: passcode ? 1 : 0.5,
                }}
                onMouseEnter={e => {
                  if (passcode) {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(54,144,206,0.3)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                onMouseDown={e => {
                  if (passcode) e.currentTarget.style.transform = 'scale(0.985)';
                }}
                onMouseUp={e => {
                  if (passcode) e.currentTarget.style.transform = 'translateY(-1px)';
                }}
              >
                Unlock
              </button>

              {/* Divider */}
            </div>
          )}

          {/* ── User Selection Step ────────────────────────────────── */}
          {step === 'user-select' && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              animation: 'entryFadeIn 0.3s ease',
              flex: 1,
              minHeight: 0,
            }}>
              {/* Search bar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <svg
                  width="14" height="14" viewBox="0 0 16 16"
                  fill={subTextColor}
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                >
                  <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.868-3.834zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search team members..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 34px',
                    fontSize: 13,
                    fontWeight: 500,
                    background: inputBg,
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(148,163,184,0.15)'}`,
                    borderRadius: 2,
                    color: textColor,
                    outline: 'none',
                    transition: 'border-color 0.12s ease',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = 'rgba(54,144,206,0.3)';
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(148,163,184,0.15)';
                  }}
                />
              </div>

              {/* Loading state */}
              {loadingTeam && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 0',
                  gap: 8,
                }}>
                  <div style={{
                    width: 16,
                    height: 16,
                    border: `2px solid ${isDarkMode ? '#334155' : '#e2e8f0'}`,
                    borderTopColor: colours.blue,
                    borderRadius: '50%',
                    animation: 'entrySpin 0.8s linear infinite',
                  }} />
                  <span style={{ fontSize: 12, color: subTextColor, fontWeight: 500 }}>
                    Loading team...
                  </span>
                </div>
              )}

              {/* Error state */}
              {fetchError && (
                <div style={{
                  padding: '12px 16px',
                  background: isDarkMode ? 'rgba(214,85,65,0.1)' : 'rgba(214,85,65,0.06)',
                  border: `1px solid rgba(214,85,65,0.2)`,
                  borderRadius: 2,
                  fontSize: 12,
                  color: colours.cta,
                  fontWeight: 500,
                }}>
                  {fetchError}
                </div>
              )}

              {/* User list */}
              {!loadingTeam && !fetchError && (
                <div style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  maxHeight: 360,
                  // Custom scrollbar
                  scrollbarWidth: 'thin',
                  scrollbarColor: isDarkMode ? '#334155 transparent' : '#cbd5e1 transparent',
                }}>
                  {filteredUsers.length === 0 && (
                    <div style={{
                      padding: '24px 0',
                      textAlign: 'center',
                      fontSize: 12,
                      color: subTextColor,
                      fontWeight: 500,
                    }}>
                      {searchQuery ? 'No matches found' : 'No team members available'}
                    </div>
                  )}

                  {filteredUsers.map((user, idx) => {
                    const isSelected = selectedUserKey === user.key;
                    return (
                      <button
                        key={user.key}
                        onClick={() => handleUserClick(user.key)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          background: isSelected
                            ? isDarkMode
                              ? 'rgba(54,144,206,0.12)'
                              : 'rgba(54,144,206,0.06)'
                            : 'transparent',
                          border: `1px solid ${isSelected
                            ? isDarkMode ? 'rgba(54,144,206,0.25)' : 'rgba(54,144,206,0.2)'
                            : 'transparent'}`,
                          borderRadius: 2,
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          transition: 'all 0.12s ease',
                          animation: `entrySlideIn 0.3s ease ${idx * 0.03}s both`,
                          outline: 'none',
                        }}
                        onMouseEnter={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = isDarkMode
                              ? 'rgba(54,144,206,0.06)'
                              : 'rgba(54,144,206,0.03)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isSelected) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                        onMouseDown={e => {
                          e.currentTarget.style.transform = 'scale(0.99)';
                        }}
                        onMouseUp={e => {
                          e.currentTarget.style.transform = 'scale(1)';
                        }}
                      >
                        <InitialsAvatar
                          initials={user.initials}
                          selected={isSelected}
                          isDarkMode={isDarkMode}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: textColor,
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {user.fullName}
                          </div>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 2,
                          }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 500,
                              color: subTextColor,
                              fontFamily: "'SF Mono', 'Consolas', monospace",
                            }}>
                              {user.initials}
                            </span>
                            {user.areas && (
                              <>
                                <span style={{
                                  width: 3,
                                  height: 3,
                                  borderRadius: '50%',
                                  background: isDarkMode ? '#475569' : '#cbd5e1',
                                  flexShrink: 0,
                                }} />
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  color: isDarkMode ? '#475569' : '#94a3b8',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}>
                                  {user.areas}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Selected indicator */}
                        {isSelected && (
                          <div style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            animation: 'entryPop 0.2s ease',
                          }}>
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="#fff">
                              <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected user summary + confirm */}
              <div style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                {selectedUser && (
                  <div style={{
                    padding: '10px 14px',
                    background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.04)',
                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)'}`,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    animation: 'entryFadeIn 0.2s ease',
                  }}>
                    <InitialsAvatar initials={selectedUser.initials} selected isDarkMode={isDarkMode} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: textColor }}>
                        {selectedUser.fullName}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: subTextColor,
                        fontFamily: "'SF Mono', 'Consolas', monospace",
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {selectedUser.email}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleConfirmUser}
                  disabled={!selectedUserKey}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    letterSpacing: '0.5px',
                    border: 'none',
                    borderRadius: 2,
                    cursor: selectedUserKey ? 'pointer' : 'default',
                    background: selectedUserKey
                      ? accent
                      : isDarkMode ? '#1e293b' : '#e2e8f0',
                    color: selectedUserKey ? '#fff' : subTextColor,
                    transition: 'all 0.12s ease',
                    opacity: selectedUserKey ? 1 : 0.5,
                  }}
                  onMouseEnter={e => {
                    if (selectedUserKey) {
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(54,144,206,0.3)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onMouseDown={e => {
                    if (selectedUserKey) e.currentTarget.style.transform = 'scale(0.985)';
                  }}
                  onMouseUp={e => {
                    if (selectedUserKey) e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                >
                  {selectedUserKey ? 'Continue as ' + (selectedUser?.fullName?.split(' ')[0] || '') : 'Select a team member'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '0 32px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            color: isDarkMode ? '#1e293b' : '#e2e8f0',
            fontFamily: "'SF Mono', 'Consolas', monospace",
          }}>
            v1.0
          </span>
          {step === 'user-select' && (
            <button
              onClick={() => {
                setStep('passcode');
                setPasscode('');
                setPasscodeError(null);
                setSelectedUserKey(null);
                setSearchQuery('');
              }}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: subTextColor,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: '4px 8px',
                borderRadius: 2,
                transition: 'color 0.12s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = colours.blue; }}
              onMouseLeave={e => { e.currentTarget.style.color = subTextColor; }}
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes entryFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes entrySlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes entryShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes entryPop {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        @keyframes entrySpin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  );
};

export default EntryGate;
