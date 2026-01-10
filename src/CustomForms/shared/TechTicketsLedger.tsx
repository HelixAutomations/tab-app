import React, { useEffect, useMemo, useState } from 'react';
import {
  DetailsList,
  DetailsListLayoutMode,
  IColumn,
  SelectionMode,
  Stack,
  Text,
  Icon,
} from '@fluentui/react';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import {
  getFormSectionHeaderStyle,
  getFormSectionStyle,
  getInfoBoxTextStyle,
} from './formStyles';

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

function formatStatus(status: string | null | undefined): string {
  const s = (status || '').toLowerCase();
  if (!s) return 'Pending approval';
  if (s === 'submitted') return 'Pending approval';
  if (s === 'asana_created') return 'Logged';
  if (s === 'asana_failed') return 'Logged (Asana failed)';
  return status || 'Pending approval';
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

  const columns = useMemo<IColumn[]>(
    () => [
      {
        key: 'title',
        name: 'Title',
        fieldName: 'title',
        minWidth: 180,
        isMultiline: true,
        onRender: (item?: LedgerItem) => <Text>{item?.title || ''}</Text>,
      },
      {
        key: 'submitted_by',
        name: 'Submitted',
        fieldName: 'submitted_by',
        minWidth: 110,
        maxWidth: 140,
        onRender: (item?: LedgerItem) => <Text>{item?.submitted_by || '—'}</Text>,
      },
      {
        key: 'created_at',
        name: 'When',
        fieldName: 'created_at',
        minWidth: 140,
        maxWidth: 190,
        onRender: (item?: LedgerItem) => <Text>{item?.created_at ? formatWhen(item.created_at) : ''}</Text>,
      },
      {
        key: 'status',
        name: 'Status',
        fieldName: 'status',
        minWidth: 120,
        maxWidth: 170,
        onRender: (item?: LedgerItem) => <Text>{formatStatus(item?.status)}</Text>,
      },
    ],
    []
  );

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

        <DetailsList
          items={items}
          columns={columns}
          setKey="tech-tickets-ledger"
          layoutMode={DetailsListLayoutMode.justified}
          selectionMode={SelectionMode.none}
          compact
          styles={{
            root: {
              backgroundColor: 'transparent',
              opacity: isLoading ? 0.7 : 1,
              '.ms-DetailsHeader': {
                backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(248, 250, 252, 0.8)',
              },
              '.ms-DetailsHeader-cellTitle': {
                color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(51, 65, 85, 0.9)',
              },
              '.ms-DetailsHeader-cellName': {
                color: isDarkMode ? 'rgba(226, 232, 240, 0.9)' : 'rgba(51, 65, 85, 0.9)',
              },
              '.ms-DetailsRow': {
                backgroundColor: 'transparent',
                borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.05)'}`,
                minHeight: '42px',
              },
              '.ms-DetailsRow:last-child': {
                borderBottom: 'none',
              },
              '.ms-DetailsRow:hover': {
                backgroundColor: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.04)',
              },
              '.ms-DetailsRow-cell': {
                paddingTop: '10px',
                paddingBottom: '10px',
                color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : 'rgba(15, 23, 42, 0.85)',
              },
              '.ms-DetailsRow-cell .ms-Text': {
                color: isDarkMode ? 'rgba(226, 232, 240, 0.92)' : 'rgba(15, 23, 42, 0.85)',
              },
            },
            headerWrapper: {
              backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(248, 250, 252, 0.8)',
              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)'}`,
              '.ms-DetailsHeader': {
                paddingTop: '0px',
                borderTop: 'none',
              },
              '.ms-DetailsHeader-cell': {
                height: '40px',
                lineHeight: '40px',
              },
            },
          }}
        />
      </Stack>
    </div>
  );
}

