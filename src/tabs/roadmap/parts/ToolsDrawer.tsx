// src/tabs/roadmap/parts/ToolsDrawer.tsx — single drawer absorbing Release Notes, API Heat detail,
// Card Lab, and Boot Trace (formerly HomeBootMonitor). Sub-tabs let the user switch between them
// without losing other state.

import React from 'react';
import { colours } from '../../../app/styles/colours';
import { useActivityContext } from '../ActivityContext';
import type { ToolsTab } from '../hooks/useActivityLayout';

interface TabSpec {
  key: ToolsTab;
  label: string;
  available: boolean;
}

interface ToolsDrawerProps {
  isDarkMode: boolean;
  hasReleaseNotes: boolean;
  showLiveMonitor: boolean;
  isLocalDev: boolean;
  showBootMonitor: boolean;
  releaseNotesContent: React.ReactNode;
  apiHeatContent: React.ReactNode;
  cardLabContent: React.ReactNode;
  bootTraceContent: React.ReactNode;
}

const ToolsDrawer: React.FC<ToolsDrawerProps> = ({
  isDarkMode,
  hasReleaseNotes,
  showLiveMonitor,
  isLocalDev,
  showBootMonitor,
  releaseNotesContent,
  apiHeatContent,
  cardLabContent,
  bootTraceContent,
}) => {
  const { toolsOpen, toolsTab, setToolsOpen, setToolsTab } = useActivityContext();
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const textColour = isDarkMode ? colours.dark.text : colours.light.text;
  const borderColour = isDarkMode ? colours.dark.border : colours.light.border;
  const surface = isDarkMode ? 'rgba(255,255,255,0.03)' : colours.light.sectionBackground;

  const tabs: TabSpec[] = [
    { key: 'releaseNotes', label: 'Changelog', available: hasReleaseNotes },
    { key: 'apiHeat', label: 'API Heat (detail)', available: showLiveMonitor },
    { key: 'cardLab', label: 'Card Lab', available: isLocalDev },
    { key: 'bootTrace', label: 'Boot Trace', available: showBootMonitor },
  ];

  const visibleTabs = tabs.filter((t) => t.available);
  if (visibleTabs.length === 0) return null;

  // If the persisted tab isn't currently available, fall back to the first available.
  const activeTab: ToolsTab = visibleTabs.some((t) => t.key === toolsTab) ? toolsTab : visibleTabs[0].key;

  const renderActive = () => {
    switch (activeTab) {
      case 'releaseNotes':
        return releaseNotesContent;
      case 'apiHeat':
        return apiHeatContent;
      case 'cardLab':
        return cardLabContent;
      case 'bootTrace':
        return bootTraceContent;
      default:
        return null;
    }
  };

  return (
    <div
      className="activity-tools-drawer"
      style={{
        marginTop: 24,
        borderTop: `1px solid ${borderColour}`,
        paddingTop: 12,
      }}
    >
      {/* Header bar — toggle + sub-tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          padding: '6px 0',
        }}
      >
        <button
          type="button"
          onClick={() => setToolsOpen(!toolsOpen)}
          aria-expanded={toolsOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px 6px 0',
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: muted,
              transform: toolsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              display: 'inline-block',
            }}
          >
            &#9654;
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: textColour,
              fontFamily: 'Raleway, sans-serif',
            }}
          >
            Tools
          </span>
          <span style={{ fontSize: 10, color: muted, fontWeight: 600 }}>
            {visibleTabs.length} available
          </span>
        </button>

        {toolsOpen && (
          <div role="tablist" aria-label="Tools" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {visibleTabs.map((t) => {
              const active = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setToolsTab(t.key)}
                  style={{
                    padding: '5px 10px',
                    background: active
                      ? (isDarkMode ? colours.accent : colours.highlight) + '1F'
                      : 'transparent',
                    color: active
                      ? (isDarkMode ? colours.accent : colours.highlight)
                      : textColour,
                    border: `1px solid ${active
                      ? (isDarkMode ? colours.accent : colours.highlight)
                      : borderColour}`,
                    borderRadius: 0,
                    fontSize: 11,
                    fontWeight: active ? 700 : 600,
                    fontFamily: 'Raleway, sans-serif',
                    cursor: 'pointer',
                    letterSpacing: '0.2px',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {toolsOpen && (
        <div
          style={{
            padding: 16,
            background: surface,
            border: `1px solid ${borderColour}`,
            borderTop: 'none',
            marginTop: 0,
          }}
        >
          {renderActive()}
        </div>
      )}
    </div>
  );
};

export default ToolsDrawer;
