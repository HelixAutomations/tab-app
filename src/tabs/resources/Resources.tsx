import React, { useMemo, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import type { IconType } from 'react-icons';
import { SiAsana, SiMiro } from 'react-icons/si';
import { FaBuilding, FaClipboardCheck, FaExternalLinkAlt, FaGavel } from 'react-icons/fa';
import type { TeamData, UserData } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours, withAlpha } from '../../app/styles/colours';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle } from '../../app/styles/FilterStyles';
import {
  INTERNAL_POLICY_LINKS,
  type InternalPolicyLink,
  openInternalPolicyDocument,
} from '../../app/customisation/InternalPolicies';
import ResourceRegisterView, { type ResourceRegisterViewKey } from './registers/ResourceRegisterView';
import '../forms/forms-tokens.css';

import nuclinoIcon from '../../assets/nuclino.svg';
import clioIcon from '../../assets/clio.svg';
import netdocumentsIcon from '../../assets/netdocuments.svg';
import activecampaignIcon from '../../assets/activecampaign.svg';
import bundledocsIcon from '../../assets/bundledocs.svg';
import leapsomeIcon from '../../assets/leapsome.svg';
import harveyIcon from '../../assets/harvey.svg';
import lexisnexisIcon from '../../assets/lexisnexis.svg';
import thompsonReutersIcon from '../../assets/thompson-reuters.svg';
import landRegistryIcon from '../../assets/land-registry.svg';

type ExternalLink = {
  title: string;
  url: string;
  icon?: string;
  IconComponent?: IconType;
  fluentIcon?: string;
  summary: string;
  group: 'Practice' | 'Government' | 'Other';
};

const EXTERNAL_LINKS: ExternalLink[] = [
  { title: 'Clio', url: 'https://eu.app.clio.com/nc/#/', icon: clioIcon, summary: 'Matter & practice management of record.', group: 'Practice' },
  { title: 'NetDocuments', url: 'https://eu.netdocuments.com/neWeb2/home', icon: netdocumentsIcon, summary: 'Document & email management for client files.', group: 'Practice' },
  { title: 'ActiveCampaign', url: 'https://helix-law54533.activehosted.com/', icon: activecampaignIcon, summary: 'Marketing automation and client journeys.', group: 'Practice' },
  { title: 'BundleDocs', url: 'https://www.bundledocs.com/', icon: bundledocsIcon, summary: 'Court and hearing bundle preparation.', group: 'Practice' },
  { title: 'Asana', url: 'https://app.asana.com/', IconComponent: SiAsana, summary: 'Project and task tracking across teams.', group: 'Practice' },
  { title: 'Nuclino', url: 'https://www.nuclino.com/', icon: nuclinoIcon, summary: 'Internal knowledge base and process wiki.', group: 'Practice' },
  { title: 'Leapsome', url: 'https://www.leapsome.com/app/#/dashboard?init=true', icon: leapsomeIcon, summary: 'People development, goals and reviews.', group: 'Practice' },
  { title: 'Harvey', url: 'https://www.harvey.ai/', icon: harveyIcon, summary: 'Legal AI assistant for drafting and research.', group: 'Practice' },
  { title: 'LexisNexis', url: 'https://www.lexisnexis.com/en-us/gateway.page', icon: lexisnexisIcon, summary: 'Primary legal research and case law.', group: 'Practice' },
  { title: 'Thomson Reuters', url: 'https://www.thomsonreuters.com/en.html', icon: thompsonReutersIcon, summary: 'Westlaw and Practical Law reference.', group: 'Practice' },
  { title: 'Land Registry', url: 'https://www.gov.uk/government/organisations/land-registry', icon: landRegistryIcon, summary: 'HM Land Registry property records portal.', group: 'Government' },
  { title: 'Companies House', url: 'https://www.gov.uk/government/organisations/companies-house', IconComponent: FaBuilding, summary: 'UK company filings and ownership data.', group: 'Government' },
  { title: 'CC-Filing', url: 'https://efile.cefile-app.com/login?referer=%2F', IconComponent: FaGavel, summary: 'High Court electronic filing service.', group: 'Government' },
  { title: 'Miro', url: 'https://miro.com/login/', IconComponent: SiMiro, summary: 'Collaborative whiteboarding and mapping.', group: 'Other' },
  { title: 'Psychometric Testing', url: 'https://links.helix-law.co.uk/assessment', IconComponent: FaClipboardCheck, summary: 'Candidate assessment portal for hiring.', group: 'Other' },
];

const EXTERNAL_GROUP_ORDER: ExternalLink['group'][] = ['Practice', 'Government', 'Other'];

type RegisterLink = {
  title: string;
  summary: string;
  icon: string;
  group: 'Compliance' | 'Expert & Counsel';
  view: ResourceRegisterViewKey;
};

const REGISTER_LINKS: RegisterLink[] = [
  {
    title: 'Undertakings Register',
    summary: 'Due dates, discharge status, breach oversight and matter links.',
    icon: 'Permissions',
    group: 'Compliance',
    view: 'undertakings',
  },
  {
    title: 'Complaints Register',
    summary: 'Complaint intake, investigation status, outcomes and lessons learned.',
    icon: 'Feedback',
    group: 'Compliance',
    view: 'complaints',
  },
  {
    title: 'Expert Register',
    summary: 'Expert witnesses by specialism, work type, source and contact detail.',
    icon: 'ContactList',
    group: 'Expert & Counsel',
    view: 'experts',
  },
  {
    title: 'Counsel Register',
    summary: 'Counsel and chambers by work type, pricing tier and clerk contact.',
    icon: 'Commitments',
    group: 'Expert & Counsel',
    view: 'counsel',
  },
];

const REGISTER_GROUP_ORDER: RegisterLink['group'][] = ['Compliance', 'Expert & Counsel'];

const toPreviewUrl = (url: string): string => {
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  return url;
};

type ToolIconMaskStyle = React.CSSProperties & { '--resources-tool-icon': string };
type PolicyStripStyle = React.CSSProperties & {
  '--resources-policy-strip-border': string;
  '--resources-policy-strip-bg': string;
  '--resources-policy-card-border': string;
  '--resources-policy-card-bg': string;
  '--resources-policy-heading': string;
  '--resources-policy-text': string;
  '--resources-policy-accent': string;
};

const toolIconMaskStyle = (icon: string): ToolIconMaskStyle => ({
  '--resources-tool-icon': `url(${icon})`,
});

interface ResourcesProps {
  userData?: UserData[] | null;
}

export interface Resource {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
  category?: string;
}

type RegisterEntry = InternalPolicyLink & {
  ref: string;
  category: string;
};

const REGISTER: RegisterEntry[] = INTERNAL_POLICY_LINKS.map((policy, index) => ({
  ...policy,
  ref: `RA-${String(index + 1).padStart(2, '0')}`,
  category: policy.tags.includes('aml')
    ? 'AML'
    : policy.tags.includes('sanctions')
      ? 'Sanctions'
      : policy.tags.includes('transaction')
        ? 'Transaction'
        : 'Client',
}));

const copyLink = (url: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(url).catch(() => {});
  }
};

const Resources: React.FC<ResourcesProps> = ({ userData }) => {
  const { isDarkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [preview, setPreview] = useState<RegisterEntry | null>(null);
  const [activeRegisterView, setActiveRegisterView] = useState<ResourceRegisterViewKey | null>(null);
  const [toast, setToast] = useState<{ id: number; title: string } | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const policyStripStyle: PolicyStripStyle = {
    '--resources-policy-strip-border': isDarkMode ? withAlpha(colours.highlight, 0.18) : withAlpha(colours.helixBlue, 0.14),
    '--resources-policy-strip-bg': isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.74) : withAlpha(colours.grey, 0.72),
    '--resources-policy-card-border': isDarkMode ? withAlpha(colours.highlight, 0.16) : withAlpha(colours.helixBlue, 0.12),
    '--resources-policy-card-bg': isDarkMode ? withAlpha(colours.dark.cardBackground, 0.74) : withAlpha('#ffffff', 0.82),
    '--resources-policy-heading': isDarkMode ? colours.dark.text : colours.websiteBlue,
    '--resources-policy-text': isDarkMode ? colours.dark.text : colours.websiteBlue,
    '--resources-policy-accent': isDarkMode ? colours.accent : colours.highlight,
  };

  const showToast = React.useCallback((title: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), title });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  React.useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  const handleExternalLink = React.useCallback((link: ExternalLink) => {
    showToast(`Opening ${link.title}`);
  }, [showToast]);

  const requestForm = React.useCallback((formTitle: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('navigateToForms', { detail: { formTitle } }));
  }, []);

  const handleRegisterLink = React.useCallback((link: RegisterLink) => {
    showToast(`Opening ${link.title}`);
    setActiveRegisterView(link.view);
  }, [requestForm, showToast]);

  const openPreview = (entry: RegisterEntry) => setPreview(entry);
  const closePreview = () => setPreview(null);

  React.useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const filteredLinks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return EXTERNAL_LINKS;
    return EXTERNAL_LINKS.filter((link) =>
      [link.title, link.summary, link.group, link.url].join(' ').toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const filteredRegisters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return REGISTER_LINKS;
    return REGISTER_LINKS.filter((link) =>
      [link.title, link.summary, link.group].join(' ').toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const groupedRegisters = useMemo(() => {
    const groups = new Map<RegisterLink['group'], RegisterLink[]>();
    REGISTER_GROUP_ORDER.forEach((g) => groups.set(g, []));
    filteredRegisters.forEach((link) => {
      const list = groups.get(link.group);
      if (list) list.push(link);
    });
    return REGISTER_GROUP_ORDER
      .map((group) => ({ group, items: groups.get(group) ?? [] }))
      .filter((entry) => entry.items.length > 0);
  }, [filteredRegisters]);

  const groupedLinks = useMemo(() => {
    const groups = new Map<ExternalLink['group'], ExternalLink[]>();
    EXTERNAL_GROUP_ORDER.forEach((g) => groups.set(g, []));
    filteredLinks.forEach((link) => {
      const list = groups.get(link.group);
      if (list) list.push(link);
    });
    return EXTERNAL_GROUP_ORDER
      .map((group) => ({ group, items: groups.get(group) ?? [] }))
      .filter((entry) => entry.items.length > 0);
  }, [filteredLinks]);

  return (
    <div
      className="forms-hub forms-hub--launcher"
      data-theme-mode={isDarkMode ? 'dark' : 'light'}
      data-helix-region="tab/resources"
    >
      <div className="forms-hub__main-shell">
        {!activeRegisterView && (
          <div className="forms-hub__utilitybar">
            <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
              <SearchBox
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(_, newValue) => setSearchQuery(newValue || '')}
                styles={sharedSearchBoxStyle(isDarkMode)}
                aria-label="Search resources"
              />
            </div>
          </div>
        )}

        <div className="forms-hub__body" data-helix-region="resources/workspace">
          {activeRegisterView ? (
            <ResourceRegisterView
              view={activeRegisterView}
              isDarkMode={isDarkMode}
              userData={userData}
              onBack={() => setActiveRegisterView(null)}
              onRequestForm={requestForm}
            />
          ) : (
            <div className="forms-hub__main-column">
              <section
                className="resources-policy-strip"
                data-helix-region="resources/risk-policy-strip"
                style={policyStripStyle}
              >
                <div className="resources-policy-strip__intro">
                  <span className="resources-policy-strip__title">Core risk policies</span>
                </div>
                <div className="resources-policy-strip__links">
                  {REGISTER.map((entry) => (
                    <button
                      type="button"
                      key={entry.key}
                      className="resources-policy-strip__link"
                      onClick={() => openPreview(entry)}
                      title={entry.description}
                      aria-label={`Preview ${entry.title}`}
                    >
                      <span>{entry.shortTitle}</span>
                      <FaExternalLinkAlt size={9} className="resources-policy-strip__icon" />
                    </button>
                  ))}
                </div>
              </section>

            <section className="forms-hub__launcher-panel helix-panel">
              <div className="forms-hub__section-title">
                <span className="forms-hub__accent" style={{ background: 'var(--helix-highlight)' }} />
                <span>Registers</span>
                <span className="forms-hub__section-count">{filteredRegisters.length}</span>
              </div>

              {groupedRegisters.length === 0 ? (
                <div className="forms-hub__empty">No registers match that search.</div>
              ) : (
                groupedRegisters.map(({ group, items }) => (
                  <div key={group} className="resources-registers__group">
                    <div className="resources-registers__group-label">{group}</div>
                    <div className="resources-registers__grid">
                      {items.map((link) => (
                        <button
                          type="button"
                          key={link.title}
                          className="resources-register-link"
                          onClick={() => handleRegisterLink(link)}
                        >
                          <span className="resources-register-link__icon" aria-hidden="true">
                            <Icon iconName={link.icon} />
                          </span>
                          <span className="resources-register-link__body">
                            <span className="resources-register-link__title">{link.title}</span>
                            <span className="resources-register-link__summary">{link.summary}</span>
                          </span>
                          <Icon iconName="ChevronRightSmall" className="resources-register-link__arrow" aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="forms-hub__launcher-panel helix-panel">
              <div className="forms-hub__section-title">
                <span className="forms-hub__accent" style={{ background: 'var(--helix-cta)' }} />
                <span>External tools</span>
                <span className="forms-hub__section-count">{filteredLinks.length}</span>
              </div>

              {groupedLinks.length === 0 ? (
                <div className="forms-hub__empty">No tools match that search.</div>
              ) : (
                groupedLinks.map(({ group, items }, groupIndex) => (
                  <div key={group} className="resources-tools__group">
                    <div className="resources-tools__group-label">
                      <span>{group}</span>
                      <span className="resources-tools__group-rule" aria-hidden="true" />
                      <span className="resources-tools__group-count">{items.length}</span>
                    </div>
                    <div className="resources-tools__grid">
                      {items.map((link, idx) => (
                        <a
                          key={link.title}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="resources-tool"
                          style={{ animationDelay: `${(groupIndex * 80) + (idx * 28)}ms` }}
                          onClick={() => handleExternalLink(link)}
                        >
                          <span className="resources-tool__icon-shell" aria-hidden="true">
                            {link.IconComponent ? (
                              <link.IconComponent className="resources-tool__icon resources-tool__icon--react" />
                            ) : link.icon ? (
                              <span className="resources-tool__icon resources-tool__icon--image" style={toolIconMaskStyle(link.icon)} />
                            ) : (
                              <Icon iconName={link.fluentIcon || 'Link'} className="resources-tool__icon resources-tool__icon--fluent" />
                            )}
                          </span>
                          <span className="resources-tool__body">
                            <span className="resources-tool__title">{link.title}</span>
                            <span className="resources-tool__summary">{link.summary}</span>
                          </span>
                          <span className="resources-tool__arrow" aria-hidden="true">
                            <Icon iconName="ChevronRightSmall" />
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
          )}
        </div>
      </div>

      <div className="resources-toast-host" aria-live="polite" aria-atomic="true">
        {toast && (
          <div key={toast.id} className="resources-toast" role="status">
            <Icon iconName="OpenInNewWindow" className="resources-toast__icon" />
            <span className="resources-toast__label">{toast.title}</span>
          </div>
        )}
      </div>

      {preview && (
        <div
          className="resources-preview__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.title} preview`}
          onClick={closePreview}
        >
          <div className="resources-preview__panel" onClick={(e) => e.stopPropagation()}>
            <div className="resources-preview__header">
              <div className="resources-preview__heading">
                <span className="resources-policy__ref">{preview.ref}</span>
                <span className="resources-preview__title">{preview.title}</span>
                <span className="resources-preview__category">{preview.category}</span>
              </div>
              <div className="resources-preview__actions">
                <button
                  type="button"
                  className="forms-hub-card__action"
                  aria-label="Copy link"
                  onClick={() => copyLink(preview.url)}
                >
                  <Icon iconName="Copy" />
                </button>
                <button
                  type="button"
                  className="forms-hub-card__action"
                  aria-label="Open in popup window"
                  onClick={() => openInternalPolicyDocument(preview.url)}
                >
                  <Icon iconName="OpenInNewWindow" />
                </button>
                <button
                  type="button"
                  className="forms-hub-card__action"
                  aria-label="Close preview"
                  onClick={closePreview}
                >
                  <Icon iconName="Cancel" />
                </button>
              </div>
            </div>
            <iframe
              key={preview.key}
              src={toPreviewUrl(preview.url)}
              title={preview.title}
              className="resources-preview__frame"
              allow="autoplay"
            />
          </div>
        </div>
      )}

      <style>{`
        .app-scroll-region.resources-scroll-region {
          scrollbar-width: none;
          scrollbar-gutter: auto;
        }
        .app-scroll-region.resources-scroll-region::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        html[data-show-scrollbars="1"] .app-scroll-region.resources-scroll-region {
          scrollbar-width: thin;
          scrollbar-color: rgba(54, 144, 206, 0.55) transparent;
          scrollbar-gutter: stable;
        }
        html[data-show-scrollbars="1"] .app-scroll-region.resources-scroll-region::-webkit-scrollbar {
          width: 10px !important;
          height: 10px !important;
          display: block;
        }
        html[data-show-scrollbars="1"] .app-scroll-region.resources-scroll-region::-webkit-scrollbar-thumb {
          background-color: rgba(54, 144, 206, 0.55);
          border: 2px solid transparent;
          border-radius: 999px;
          background-clip: padding-box;
        }
        html[data-show-scrollbars="1"] .app-scroll-region.resources-scroll-region::-webkit-scrollbar-thumb:hover {
          background-color: rgba(54, 144, 206, 0.8);
          background-clip: padding-box;
        }
        .forms-hub[data-helix-region="tab/resources"] {
          height: auto;
          min-height: 100%;
          overflow: visible;
        }
        .forms-hub[data-helix-region="tab/resources"],
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__main-shell,
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__body,
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__main-column,
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__launcher-panel {
          min-width: 0;
          min-height: auto;
          max-width: 100%;
          max-height: none;
          overflow: visible;
          box-sizing: border-box;
        }
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__main-shell,
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__body,
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__main-column,
        .forms-hub[data-helix-region="tab/resources"] .forms-hub__launcher-panel {
          flex: 0 0 auto;
        }
        .resources-policy-strip {
          display: grid;
          grid-template-columns: minmax(180px, 0.55fr) minmax(0, 1.45fr);
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          margin: 0;
          border: 1px solid var(--resources-policy-strip-border);
          background: var(--resources-policy-strip-bg);
          font-family: var(--font-primary);
          box-sizing: border-box;
        }
        .resources-policy-strip__intro {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 3px;
          min-width: 0;
        }
        .resources-policy-strip__title {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--resources-policy-heading);
        }
        .resources-policy-strip__links {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
          gap: 8px;
          min-width: 0;
        }
        .resources-policy-strip__link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-height: 40px;
          padding: 8px 10px;
          border: 1px solid var(--resources-policy-card-border);
          background: var(--resources-policy-card-bg);
          color: var(--resources-policy-text);
          font-family: var(--font-primary);
          font-size: 11px;
          font-weight: 700;
          line-height: 1.2;
          text-align: left;
          cursor: pointer;
        }
        .resources-policy-strip__link:hover,
        .resources-policy-strip__link:focus-visible {
          border-color: var(--resources-policy-accent);
          outline: none;
        }
        .resources-policy-strip__link span {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .resources-policy-strip__icon {
          flex-shrink: 0;
          color: var(--resources-policy-accent);
        }
        .resources-registers__group { margin-top: 16px; min-width: 0; max-width: 100%; }
        .resources-registers__group:first-of-type { margin-top: 12px; }
        .resources-registers__group-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .resources-registers__grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }
        .resources-register-link {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 16px;
          gap: 12px;
          align-items: flex-start;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          color: var(--text-primary);
          font-family: var(--font-primary);
          text-align: left;
          cursor: pointer;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }
        .resources-register-link:hover,
        .resources-register-link:focus-visible {
          border-color: var(--helix-highlight);
          background: var(--home-row-hover-bg);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
          outline: none;
        }
        .resources-register-link:active {
          transform: translateY(0) scale(0.99);
          box-shadow: none;
        }
        .resources-register-link__icon {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--home-card-border);
          background: var(--home-strip-bg);
          color: var(--text-accent);
          font-size: 16px;
        }
        .resources-register-link__body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .resources-register-link__title {
          font-size: 12.5px;
          font-weight: 750;
          color: var(--text-primary);
        }
        .resources-register-link__summary {
          font-size: 11px;
          line-height: 1.35;
          color: var(--text-body);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .resources-register-link__arrow {
          color: var(--text-muted);
          font-size: 12px;
          opacity: 0.7;
        }
        .resources-preview__overlay {
          position: fixed;
          inset: 0;
          background: rgba(8, 12, 22, 0.55);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .resources-preview__panel {
          width: min(1120px, 100%);
          height: min(860px, 92vh);
          background: var(--surface-card);
          border: 1px solid var(--home-card-border);
          box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .resources-preview__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--home-card-border);
          background: var(--home-strip-bg);
        }
        .resources-preview__heading {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .resources-preview__title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .resources-preview__category {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-secondary);
        }
        .resources-preview__actions {
          display: inline-flex;
          gap: 6px;
        }
        .resources-preview__frame {
          flex: 1;
          width: 100%;
          border: none;
          background: var(--surface-base);
        }
        .resources-tools__group { margin-top: 18px; min-width: 0; max-width: 100%; }
        .resources-tools__group:first-of-type { margin-top: 12px; }
        .resources-tools__group-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: 10px;
        }
        .resources-tools__group-rule {
          flex: 1;
          height: 1px;
          background: linear-gradient(to right, var(--home-card-border), transparent);
        }
        .resources-tools__group-count {
          padding: 2px 8px;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          color: var(--text-secondary);
          font-size: 10px;
          letter-spacing: 0.04em;
        }
        .resources-tools__grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }
        @keyframes resources-tool-reveal {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .resources-tool {
          position: relative;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) 18px;
          gap: 12px;
          align-items: flex-start;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
          padding: 10px 12px;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          color: var(--text-primary);
          text-decoration: none;
          overflow: visible;
          opacity: 0;
          animation: resources-tool-reveal 320ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
          transition:
            transform 160ms cubic-bezier(0.22, 0.61, 0.36, 1),
            border-color 160ms ease,
            background 160ms ease,
            box-shadow 160ms ease;
        }
        .resources-tool::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 2px;
          background: var(--helix-cta);
          transform: scaleY(0);
          transform-origin: top;
          transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .resources-tool:hover {
          border-color: var(--helix-cta);
          background: var(--home-row-hover-bg);
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
        }
        .resources-tool:hover::before { transform: scaleY(1); }
        .resources-tool:focus-visible {
          outline: none;
          border-color: var(--helix-cta);
          box-shadow: 0 0 0 2px var(--helix-cta);
        }
        .resources-tool:active {
          transform: translateY(0) scale(0.985);
          box-shadow: none;
          background: var(--home-strip-bg);
        }
        .resources-tool__icon-shell {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--home-strip-bg);
          border: 1px solid var(--home-card-border);
          flex-shrink: 0;
          color: var(--text-accent);
          transition: border-color 160ms ease, background 160ms ease;
        }
        .resources-tool:hover .resources-tool__icon-shell {
          border-color: var(--helix-cta);
          background: var(--surface-card);
        }
        .resources-tool__icon {
          width: 20px;
          height: 20px;
          object-fit: contain;
          color: var(--text-accent);
        }
        .resources-tool__icon--image {
          display: inline-block;
          background: currentColor;
          -webkit-mask: var(--resources-tool-icon) center / contain no-repeat;
          mask: var(--resources-tool-icon) center / contain no-repeat;
        }
        .resources-tool__icon--react {
          color: var(--text-accent);
        }
        .resources-tool__icon--fluent {
          font-size: 18px;
          color: var(--text-accent);
        }
        .resources-tool__body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .resources-tool__title {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-primary);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .resources-tool__summary {
          font-size: 11px;
          line-height: 1.35;
          color: var(--text-body);
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .resources-tool__arrow {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          color: var(--text-muted);
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 160ms ease, transform 160ms cubic-bezier(0.22, 0.61, 0.36, 1), color 160ms ease;
          font-size: 12px;
        }
        .resources-tool:hover .resources-tool__arrow,
        .resources-tool:focus-visible .resources-tool__arrow {
          opacity: 1;
          transform: translateX(0);
          color: var(--helix-cta);
        }
        .resources-toast-host {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 1100;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        @keyframes resources-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .resources-toast {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: var(--surface-card);
          border: 1px solid var(--helix-cta);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 600;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
          animation: resources-toast-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        .resources-toast__icon {
          font-size: 14px;
          color: var(--helix-cta);
        }
        @media (max-width: 1180px) {
          .resources-tools__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 860px) {
          .resources-policy-strip { grid-template-columns: minmax(0, 1fr); }
          .resources-tools__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .resources-registers__grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 580px) {
          .resources-tools__grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (prefers-reduced-motion: reduce) {
          .resources-tool,
          .resources-toast,
          .resources-tool__arrow,
          .resources-tool__icon-shell,
          .resources-tool::before { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
};

export default Resources;
