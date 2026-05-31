import React, { useMemo, useState } from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import type { UserData } from '../../../app/functionality/types';
import { sharedSearchBoxContainerStyle, sharedSearchBoxStyle } from '../../../app/styles/FilterStyles';
import { getApiBase } from '../../../utils/getApiUrl';

export type ResourceRegisterViewKey = 'undertakings' | 'complaints' | 'experts' | 'counsel';

interface ResourceRegisterViewProps {
  view: ResourceRegisterViewKey;
  isDarkMode: boolean;
  userData?: UserData[] | null;
  onBack: () => void;
  onRequestForm: (formTitle: string) => void;
}

interface Undertaking {
  id: number;
  matter_ref: string | null;
  given_by: string;
  given_to: string;
  given_date: string;
  due_date: string | null;
  description: string;
  status: string;
  discharged_date: string | null;
  area_of_work: string | null;
}

interface Complaint {
  id: number;
  matter_ref: string | null;
  complainant: string;
  respondent: string;
  received_date: string;
  description: string;
  category: string | null;
  status: string;
  outcome: string | null;
  closed_date: string | null;
  lessons_learned: string | null;
  area_of_work: string | null;
}

interface Expert {
  id: number;
  prefix: string;
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  phone: string;
  website: string;
  cv_url: string;
  area_of_work: string;
  worktype: string;
  introduced_by: string;
  source: string;
  notes: string;
  is_active: boolean;
}

interface Counsel {
  id: number;
  prefix: string;
  first_name: string;
  last_name: string;
  chambers_name: string;
  email: string;
  clerks_email: string;
  phone: string;
  website: string;
  cv_url: string;
  area_of_work: string;
  worktype: string;
  price_tier: string;
  introduced_by: string;
  source: string;
  notes: string;
  is_active: boolean;
}

const VIEW_META: Record<ResourceRegisterViewKey, {
  title: string;
  eyebrow: string;
  summary: string;
  icon: string;
  primaryLabel: string;
  primaryForm: string;
  searchPlaceholder: string;
}> = {
  undertakings: {
    title: 'Undertakings Register',
    eyebrow: 'Compliance control',
    summary: 'Monitor live undertakings by status, due date, matter and owner. New entries start through the structured Forms flow.',
    icon: 'Permissions',
    primaryLabel: 'New undertaking',
    primaryForm: 'New Undertaking',
    searchPlaceholder: 'Search undertakings by matter, person, status or description...',
  },
  complaints: {
    title: 'Complaints Register',
    eyebrow: 'Compliance oversight',
    summary: 'Track complaint intake, investigation status, outcomes and lessons learned without dropping into the old form history layout.',
    icon: 'Feedback',
    primaryLabel: 'New complaint',
    primaryForm: 'New Complaint',
    searchPlaceholder: 'Search complaints by matter, party, status or outcome...',
  },
  experts: {
    title: 'Expert Register',
    eyebrow: 'External specialist panel',
    summary: 'Profile-led view of expert witnesses with contact actions, areas of work, source and supporting CV or website links.',
    icon: 'ContactList',
    primaryLabel: 'Recommend expert',
    primaryForm: 'Recommend Expert',
    searchPlaceholder: 'Search experts by name, company, work type, area or contact...',
  },
  counsel: {
    title: 'Counsel Register',
    eyebrow: 'Counsel panel',
    summary: 'Counsel and chambers register with price tier, work type, clerks, contact actions and CV or website links.',
    icon: 'Commitments',
    primaryLabel: 'Recommend counsel',
    primaryForm: 'Recommend Counsel',
    searchPlaceholder: 'Search counsel by name, chambers, work type, price tier or contact...',
  },
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return 'No date';
  try {
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
};

const daysUntil = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - Date.now()) / 86400000);
};

const normalise = (value: string | null | undefined): string => (value || '').trim();

const compactSearch = (values: Array<string | number | null | undefined>) =>
  values.map((value) => String(value || '').toLowerCase()).join(' ');

const statusClass = (status: string | null | undefined) => {
  const key = (status || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `resource-register-status resource-register-status--${key}`;
};

const getFullName = (item: { prefix?: string; first_name?: string; last_name?: string }) =>
  [item.prefix, item.first_name, item.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact';

const phoneHref = (phone: string | null | undefined): string | null => {
  const cleaned = (phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
};

const ResourceRegisterView: React.FC<ResourceRegisterViewProps> = ({
  view,
  isDarkMode,
  userData,
  onBack,
  onRequestForm,
}) => {
  const meta = VIEW_META[view];
  const userInitials = (userData?.[0]?.Initials || '').toUpperCase();
  const [query, setQuery] = useState('');
  const [undertakings, setUndertakings] = useState<Undertaking[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [counsel, setCounsel] = useState<Counsel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerHeaders = useMemo((): Record<string, string> => {
    if (!userInitials) return {};
    return { 'x-helix-initials': userInitials };
  }, [userInitials]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const baseUrl = getApiBase();
    try {
      if (view === 'undertakings') {
        const response = await fetch(`${baseUrl}/api/registers/undertakings`, { headers: registerHeaders });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to load undertakings');
        setUndertakings(data.undertakings || []);
        return;
      }

      if (view === 'complaints') {
        const response = await fetch(`${baseUrl}/api/registers/complaints`, { headers: registerHeaders });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to load complaints');
        setComplaints(data.complaints || []);
        return;
      }

      if (view === 'experts') {
        const response = await fetch(`${baseUrl}/api/experts`);
        if (!response.ok) throw new Error('Failed to load experts');
        const data = await response.json();
        setExperts(Array.isArray(data) ? data : []);
        return;
      }

      const response = await fetch(`${baseUrl}/api/counsel`);
      if (!response.ok) throw new Error('Failed to load counsel');
      const data = await response.json();
      setCounsel(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load register');
    } finally {
      setLoading(false);
    }
  }, [registerHeaders, view]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const exportDirectory = React.useCallback(async () => {
    if (view !== 'experts' && view !== 'counsel') return;
    const baseUrl = getApiBase();
    const path = view === 'experts' ? 'experts' : 'counsel';
    try {
      const response = await fetch(`${baseUrl}/api/${path}/export/csv`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${path}-directory-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }, [view]);

  const visibleUndertakings = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return undertakings;
    return undertakings.filter((item) => compactSearch([
      item.description,
      item.status,
      item.given_by,
      item.given_to,
      item.matter_ref,
      item.area_of_work,
    ]).includes(search));
  }, [query, undertakings]);

  const visibleComplaints = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return complaints;
    return complaints.filter((item) => compactSearch([
      item.description,
      item.status,
      item.complainant,
      item.respondent,
      item.matter_ref,
      item.outcome,
      item.category,
      item.area_of_work,
    ]).includes(search));
  }, [complaints, query]);

  const visibleExperts = useMemo(() => {
    const search = query.trim().toLowerCase();
    const active = experts.filter((item) => item.is_active !== false);
    if (!search) return active;
    return active.filter((item) => compactSearch([
      getFullName(item),
      item.company_name,
      item.email,
      item.phone,
      item.area_of_work,
      item.worktype,
      item.source,
      item.notes,
    ]).includes(search));
  }, [experts, query]);

  const visibleCounsel = useMemo(() => {
    const search = query.trim().toLowerCase();
    const active = counsel.filter((item) => item.is_active !== false);
    if (!search) return active;
    return active.filter((item) => compactSearch([
      getFullName(item),
      item.chambers_name,
      item.email,
      item.clerks_email,
      item.phone,
      item.area_of_work,
      item.worktype,
      item.price_tier,
      item.source,
      item.notes,
    ]).includes(search));
  }, [counsel, query]);

  const totalCount = view === 'undertakings'
    ? visibleUndertakings.length
    : view === 'complaints'
      ? visibleComplaints.length
      : view === 'experts'
        ? visibleExperts.length
        : visibleCounsel.length;

  const metrics = useMemo(() => {
    if (view === 'undertakings') {
      const outstanding = undertakings.filter((item) => item.status === 'outstanding').length;
      const dueSoon = undertakings.filter((item) => {
        const days = daysUntil(item.due_date);
        return days !== null && days >= 0 && days <= 14;
      }).length;
      const overdue = undertakings.filter((item) => {
        const days = daysUntil(item.due_date);
        return item.status === 'outstanding' && days !== null && days < 0;
      }).length;
      return [
        { label: 'Live', value: outstanding },
        { label: 'Due 14d', value: dueSoon },
        { label: 'Overdue', value: overdue },
      ];
    }

    if (view === 'complaints') {
      const open = complaints.filter((item) => ['open', 'investigating', 'escalated'].includes((item.status || '').toLowerCase())).length;
      const escalated = complaints.filter((item) => (item.status || '').toLowerCase() === 'escalated').length;
      const closed = complaints.filter((item) => ['closed', 'resolved'].includes((item.status || '').toLowerCase())).length;
      return [
        { label: 'Open', value: open },
        { label: 'Escalated', value: escalated },
        { label: 'Closed', value: closed },
      ];
    }

    if (view === 'experts') {
      const contactable = visibleExperts.filter((item) => item.email || item.phone).length;
      const withCv = visibleExperts.filter((item) => item.cv_url).length;
      const areas = new Set(visibleExperts.map((item) => item.area_of_work).filter(Boolean)).size;
      return [
        { label: 'Profiles', value: visibleExperts.length },
        { label: 'Contactable', value: contactable },
        { label: 'Areas', value: areas },
        { label: 'CVs', value: withCv },
      ];
    }

    const contactable = visibleCounsel.filter((item) => item.email || item.clerks_email || item.phone).length;
    const chambers = new Set(visibleCounsel.map((item) => item.chambers_name).filter(Boolean)).size;
    const premium = visibleCounsel.filter((item) => item.price_tier === 'expensive').length;
    return [
      { label: 'Profiles', value: visibleCounsel.length },
      { label: 'Contactable', value: contactable },
      { label: 'Chambers', value: chambers },
      { label: 'Premium', value: premium },
    ];
  }, [complaints, undertakings, view, visibleCounsel, visibleExperts]);

  const renderComplianceRow = (item: Undertaking | Complaint) => {
    const isUndertaking = 'given_to' in item;
    const title = isUndertaking ? item.description : item.description;
    const status = normalise(item.status) || 'Unknown';
    const primaryMeta = isUndertaking
      ? `Given by ${item.given_by || 'Unknown'} to ${item.given_to || 'Unknown'}`
      : `${item.complainant || 'Unknown'} against ${item.respondent || 'Unknown'}`;
    const dateLabel = isUndertaking
      ? item.due_date ? `Due ${formatDate(item.due_date)}` : `Given ${formatDate(item.given_date)}`
      : item.closed_date ? `Closed ${formatDate(item.closed_date)}` : `Received ${formatDate(item.received_date)}`;
    const railTone = status.toLowerCase();

    return (
      <article key={`${view}-${item.id}`} className={`resource-register-row resource-register-row--${railTone}`}>
        <div className="resource-register-row__rail" aria-hidden="true" />
        <div className="resource-register-row__main">
          <div className="resource-register-row__headline">
            <span className="resource-register-row__title">{title}</span>
            <span className={statusClass(status)}>{status}</span>
          </div>
          <div className="resource-register-row__meta">
            <span>{primaryMeta}</span>
            <span>{dateLabel}</span>
            {item.matter_ref && <span>{item.matter_ref}</span>}
            {item.area_of_work && <span>{item.area_of_work}</span>}
          </div>
          {!isUndertaking && item.outcome && (
            <div className="resource-register-row__note">Outcome: {item.outcome}</div>
          )}
          {!isUndertaking && item.lessons_learned && (
            <div className="resource-register-row__note">Lessons: {item.lessons_learned}</div>
          )}
        </div>
      </article>
    );
  };

  const renderContactProfile = (item: Expert | Counsel) => {
    const isCounsel = 'chambers_name' in item;
    const name = getFullName(item);
    const organisation = isCounsel ? item.chambers_name : item.company_name;
    const email = normalise(item.email);
    const clerkEmail = isCounsel ? normalise(item.clerks_email) : '';
    const phone = normalise(item.phone);
    const tel = phoneHref(phone);
    const website = normalise(item.website);
    const cv = normalise(item.cv_url);

    return (
      <article key={`${view}-${item.id}`} className="resource-profile">
        <div className="resource-profile__identity">
          <div className="resource-profile__avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>
          <div className="resource-profile__heading">
            <span className="resource-profile__name">{name}</span>
            <span className="resource-profile__org">{organisation || 'No organisation listed'}</span>
          </div>
          {isCounsel && item.price_tier && <span className="resource-profile__tier">{item.price_tier}</span>}
        </div>

        <div className="resource-profile__chips">
          {item.area_of_work && <span>{item.area_of_work}</span>}
          {item.worktype && <span>{item.worktype}</span>}
          {item.source && <span>Source: {item.source}</span>}
        </div>

        {item.notes && <p className="resource-profile__notes">{item.notes}</p>}

        <div className="resource-profile__actions">
          {email && <a className="resource-action" href={`mailto:${email}`}><Icon iconName="Mail" />Email</a>}
          {clerkEmail && <a className="resource-action" href={`mailto:${clerkEmail}`}><Icon iconName="MailForward" />Clerks</a>}
          {tel && <a className="resource-action" href={tel}><Icon iconName="Phone" />Call</a>}
          {website && <a className="resource-action" href={website} target="_blank" rel="noopener noreferrer"><Icon iconName="Globe" />Website</a>}
          {cv && <a className="resource-action" href={cv} target="_blank" rel="noopener noreferrer"><Icon iconName="PDF" />CV</a>}
        </div>
      </article>
    );
  };

  const renderRecords = () => {
    if (loading) {
      return (
        <div className="resource-register-list" aria-busy="true">
          {[0, 1, 2].map((index) => <div key={index} className="resource-register-skeleton" />)}
        </div>
      );
    }

    if (error) {
      return (
        <div className="resource-register-empty resource-register-empty--error">
          <Icon iconName="ErrorBadge" />
          <span>{error}</span>
          <button type="button" className="resource-register-view__secondary" onClick={loadData}>Retry</button>
        </div>
      );
    }

    if (totalCount === 0) {
      return (
        <div className="resource-register-empty">
          <Icon iconName="SearchIssue" />
          <span>No matching records.</span>
        </div>
      );
    }

    if (view === 'undertakings') {
      return <div className="resource-register-list">{visibleUndertakings.map(renderComplianceRow)}</div>;
    }

    if (view === 'complaints') {
      return <div className="resource-register-list">{visibleComplaints.map(renderComplianceRow)}</div>;
    }

    if (view === 'experts') {
      return <div className="resource-profile-grid">{visibleExperts.map(renderContactProfile)}</div>;
    }

    return <div className="resource-profile-grid">{visibleCounsel.map(renderContactProfile)}</div>;
  };

  return (
    <div className="resource-register-view forms-hub__detail" data-helix-region={`resources/register-view/${view}`}>
      <div className="forms-hub__detail-header resource-register-view__header">
        <div className="forms-hub__detail-title-row">
          <button className="forms-hub__back" onClick={onBack} type="button">
            <Icon iconName="ChevronLeft" />
            Back
          </button>
          <span className="forms-hub__detail-separator" aria-hidden="true">|</span>
          <div className="forms-hub__detail-title">{meta.title}</div>
        </div>
      </div>

      <section className="resource-register-view__hero helix-panel">
        <div className="resource-register-view__hero-main">
          <span className="resource-register-view__icon" aria-hidden="true"><Icon iconName={meta.icon} /></span>
          <div>
            <span className="resource-register-view__eyebrow">{meta.eyebrow}</span>
            <h2>{meta.title}</h2>
            <p>{meta.summary}</p>
          </div>
        </div>
        <div className="resource-register-view__actions">
          <button type="button" className="resource-register-view__primary" onClick={() => onRequestForm(meta.primaryForm)}>
            <Icon iconName="Add" />
            <span>{meta.primaryLabel}</span>
          </button>
          {(view === 'experts' || view === 'counsel') && (
            <button type="button" className="resource-register-view__secondary" onClick={exportDirectory}>
              <Icon iconName="Download" />
              <span>Export CSV</span>
            </button>
          )}
          <button type="button" className="resource-register-view__secondary" onClick={loadData}>
            <Icon iconName="Refresh" />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      <section className="resource-register-view__toolbar helix-panel">
        <div className={sharedSearchBoxContainerStyle(isDarkMode)}>
          <SearchBox
            value={query}
            onChange={(_, next) => setQuery(next || '')}
            placeholder={meta.searchPlaceholder}
            styles={sharedSearchBoxStyle(isDarkMode)}
            aria-label={`Search ${meta.title}`}
          />
        </div>
        <div className="resource-register-view__metrics">
          {metrics.map((metric) => (
            <div key={metric.label} className="resource-register-metric">
              <span>{metric.value}</span>
              <small>{metric.label}</small>
            </div>
          ))}
        </div>
      </section>

      {renderRecords()}

      <style>{`
        .resource-register-view {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          height: auto;
          min-height: auto;
          overflow: visible;
        }
        .resource-register-view__header {
          flex-shrink: 0;
        }
        .resource-register-view__primary,
        .resource-register-view__secondary,
        .resource-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 34px;
          padding: 8px 12px;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          color: var(--text-primary);
          font-family: var(--font-primary);
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
        }
        .resource-register-view__secondary:hover,
        .resource-register-view__secondary:focus-visible,
        .resource-action:hover,
        .resource-action:focus-visible {
          border-color: var(--helix-highlight);
          background: var(--home-row-hover-bg);
          outline: none;
        }
        .resource-register-view__primary {
          border-color: var(--helix-highlight);
          background: var(--helix-highlight);
          color: #fff;
        }
        .resource-register-view__primary:hover,
        .resource-register-view__primary:focus-visible {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
          outline: none;
        }
        .resource-register-view__primary:active,
        .resource-register-view__secondary:active,
        .resource-action:active {
          transform: translateY(0) scale(0.99);
          box-shadow: none;
        }
        .resource-register-view__hero,
        .resource-register-view__toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px;
        }
        .resource-register-view__hero-main {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          min-width: 0;
        }
        .resource-register-view__icon {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--home-card-border);
          background: var(--home-strip-bg);
          color: var(--text-accent);
          font-size: 18px;
          flex-shrink: 0;
        }
        .resource-register-view__eyebrow {
          display: block;
          margin-bottom: 4px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-accent);
        }
        .resource-register-view__hero h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 750;
          color: var(--text-primary);
        }
        .resource-register-view__hero p {
          margin: 6px 0 0;
          max-width: 720px;
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-body);
        }
        .resource-register-view__actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .resource-register-view__toolbar > div:first-child {
          flex: 1;
          min-width: min(360px, 100%);
        }
        .resource-register-view__metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(72px, 1fr));
          gap: 8px;
        }
        .resource-register-metric {
          min-width: 72px;
          padding: 8px 10px;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          text-align: right;
        }
        .resource-register-metric span,
        .resource-register-metric small {
          display: block;
        }
        .resource-register-metric span {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
        }
        .resource-register-metric small {
          margin-top: 2px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .resource-register-list,
        .resource-profile-grid {
          display: grid;
          gap: 8px;
        }
        .resource-profile-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .resource-register-row,
        .resource-profile {
          position: relative;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          min-width: 0;
          max-width: 100%;
          overflow: visible;
        }
        .resource-register-row {
          display: grid;
          grid-template-columns: 4px minmax(0, 1fr);
        }
        .resource-register-row__rail {
          background: var(--helix-highlight);
        }
        .resource-register-row--breached .resource-register-row__rail,
        .resource-register-row--escalated .resource-register-row__rail,
        .resource-register-status--breached,
        .resource-register-status--escalated {
          background: rgba(197, 48, 48, 0.14);
          color: #c53030;
          border-color: rgba(197, 48, 48, 0.28);
        }
        .resource-register-row--outstanding .resource-register-row__rail,
        .resource-register-row--open .resource-register-row__rail,
        .resource-register-row--investigating .resource-register-row__rail {
          background: #d97706;
        }
        .resource-register-row--discharged .resource-register-row__rail,
        .resource-register-row--resolved .resource-register-row__rail,
        .resource-register-row--closed .resource-register-row__rail {
          background: #20b26c;
        }
        .resource-register-row__main,
        .resource-profile {
          padding: 12px 14px;
        }
        .resource-register-row__headline,
        .resource-profile__identity {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }
        .resource-register-row__title {
          font-size: 13px;
          font-weight: 750;
          line-height: 1.35;
          color: var(--text-primary);
        }
        .resource-register-status {
          flex-shrink: 0;
          padding: 3px 8px;
          border: 1px solid var(--home-card-border);
          background: var(--home-strip-bg);
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .resource-register-status--outstanding,
        .resource-register-status--open,
        .resource-register-status--investigating {
          background: rgba(217, 119, 6, 0.12);
          color: #d97706;
          border-color: rgba(217, 119, 6, 0.28);
        }
        .resource-register-status--discharged,
        .resource-register-status--resolved,
        .resource-register-status--closed {
          background: rgba(32, 178, 108, 0.12);
          color: #20b26c;
          border-color: rgba(32, 178, 108, 0.28);
        }
        .resource-register-row__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-body);
        }
        .resource-register-row__note {
          margin-top: 8px;
          font-size: 11px;
          line-height: 1.4;
          color: var(--text-muted);
        }
        .resource-profile__identity {
          align-items: center;
        }
        .resource-profile__avatar {
          width: 38px;
          height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--home-card-border);
          background: var(--home-strip-bg);
          color: var(--text-accent);
          font-size: 16px;
          font-weight: 800;
          flex-shrink: 0;
        }
        .resource-profile__heading {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .resource-profile__name {
          font-size: 14px;
          font-weight: 800;
          color: var(--text-primary);
        }
        .resource-profile__org {
          font-size: 11px;
          color: var(--text-body);
          overflow-wrap: anywhere;
          white-space: normal;
        }
        .resource-profile__tier {
          padding: 3px 8px;
          border: 1px solid var(--home-card-border);
          color: var(--text-accent);
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .resource-profile__chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }
        .resource-profile__chips span {
          padding: 3px 8px;
          border: 1px solid var(--home-card-border);
          background: var(--home-strip-bg);
          color: var(--text-secondary);
          font-size: 10px;
          font-weight: 700;
        }
        .resource-profile__notes {
          margin: 10px 0 0;
          font-size: 11px;
          line-height: 1.45;
          color: var(--text-body);
        }
        .resource-profile__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }
        .resource-action {
          min-height: 30px;
          padding: 6px 10px;
          font-size: 11px;
        }
        .resource-register-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 160px;
          border: 1px solid var(--home-card-border);
          background: var(--surface-card);
          color: var(--text-body);
          font-size: 12px;
        }
        .resource-register-empty--error {
          color: #c53030;
        }
        .resource-register-skeleton {
          height: 74px;
          border: 1px solid var(--home-card-border);
          background: linear-gradient(90deg, var(--surface-card), var(--home-row-hover-bg), var(--surface-card));
          background-size: 200% 100%;
          animation: resource-register-skeleton 1.1s ease-in-out infinite;
        }
        @keyframes resource-register-skeleton {
          from { background-position: 0% 0; }
          to { background-position: -200% 0; }
        }
        @media (max-width: 980px) {
          .resource-register-view__hero,
          .resource-register-view__toolbar { align-items: stretch; flex-direction: column; }
          .resource-register-view__actions { justify-content: flex-start; }
          .resource-profile-grid { grid-template-columns: minmax(0, 1fr); }
          .resource-register-view__metrics { width: 100%; }
        }
        @media (max-width: 620px) {
          .resource-register-view__metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .resource-register-row__headline { flex-direction: column; align-items: flex-start; }
        }
        @media (prefers-reduced-motion: reduce) {
          .resource-register-skeleton,
          .resource-register-view__primary,
          .resource-register-view__secondary,
          .resource-action { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
};

export default ResourceRegisterView;