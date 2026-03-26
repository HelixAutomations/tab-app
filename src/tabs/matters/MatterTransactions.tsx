// src/tabs/matters/MatterTransactions.tsx
// invisible change

import React, { useMemo } from 'react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Text } from '@fluentui/react/lib/Text';
import { Stack } from '@fluentui/react/lib/Stack';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Separator } from '@fluentui/react/lib/Separator';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from 'recharts';
import { Matter, Transaction } from '../../app/functionality/types';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import TransactionCard from '../transactions/TransactionCard';
import { Icon } from '@fluentui/react/lib/Icon';

interface MatterTransactionsProps {
  matter: Matter;
  transactions?: Transaction[];
  isLoading?: boolean;
}

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '30px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    minHeight: 'calc(100vh - 80px)',
    fontFamily: 'Raleway, sans-serif',
    overflowY: 'auto',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

// Outer section container for the whole transactions view
const sectionContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
    borderRadius: 0,
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(0,0,0,0.8)'
      : '0 2px 8px rgba(0,0,0,0.1)',
    padding: '24px',
  });

// Header showing folder icon and matter reference
const matterHeaderStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  marginBottom: '24px',
});

// Container for the metrics and chart side by side
const summaryChartContainer = mergeStyles({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '20px',
  marginBottom: '24px',
});

// Metrics container styling (left side)
const metricsBoxStyle = mergeStyles({
  flex: '1 1 250px',
  minWidth: '280px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-around',
});

// Style for each metric item
const metricItemStyle = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    marginBottom: 15,
  },
};

// Chart container (right side)
const chartBoxStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: '1 1 300px',
    minWidth: '280px',
    height: '260px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    borderRadius: 0,
    boxShadow: isDarkMode
      ? '0 2px 4px rgba(0,0,0,0.7)'
      : '0 2px 4px rgba(0,0,0,0.1)',
    padding: '16px',
  });

// Grid container for transaction cards
const transactionsGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '20px',
});

const MatterTransactions: React.FC<MatterTransactionsProps> = ({
  matter,
  transactions,
  isLoading,
}) => {
  const { isDarkMode } = useTheme();

  // Filter transactions for this matter based on matter_ref
  const matterTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => t.matter_ref === matter.DisplayNumber);
  }, [transactions, matter.DisplayNumber]);

  // Summaries for metrics
  const summary = useMemo(() => {
    let processedCount = 0;
    let processedTotal = 0;
    let pendingCount = 0;
    let pendingTotal = 0;
    let grandTotal = 0;

    matterTransactions.forEach((t) => {
      const amt = t.amount || 0;
      grandTotal += amt;
      if (t.status?.toLowerCase() === 'processed') {
        processedCount++;
        processedTotal += amt;
      } else {
        pendingCount++;
        pendingTotal += amt;
      }
    });

    return {
      totalCount: matterTransactions.length,
      processedCount,
      processedTotal,
      pendingCount,
      pendingTotal,
      grandTotal,
    };
  }, [matterTransactions]);

  // Aggregate monthly data for the chart (by YYYY-MM)
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    matterTransactions.forEach((tx) => {
      const date = new Date(tx.transaction_date);
      if (isNaN(date.getTime())) return;
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;
      map.set(monthKey, (map.get(monthKey) || 0) + tx.amount);
    });
    const arrayData = Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    return arrayData.map(([month, total]) => ({ month, total }));
  }, [matterTransactions]);

  if (isLoading) {
    return (
      <div className={containerStyle(isDarkMode)}>
        <Spinner label="Loading transactions..." size={SpinnerSize.medium} />
      </div>
    );
  }

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={sectionContainerStyle(isDarkMode)}>
        {/* Matter Header */}
        <div className={matterHeaderStyle}>
          <Icon
            iconName="OpenFolderHorizontal"
            styles={{ root: { fontSize: 36, color: colours.highlight } }}
          />
          <Text variant="xxLarge" styles={{ root: { fontWeight: 700, color: colours.highlight } }}>
            {matter.DisplayNumber}
          </Text>
        </div>

        {/* Metrics & Chart Section */}
        <div className={summaryChartContainer}>
          {/* Metrics Box */}
          <div className={metricsBoxStyle}>
            {/* Transactions count header */}
            <Stack horizontal verticalAlign="baseline" tokens={{ childrenGap: 8 }}>
              <Text variant="large" styles={{ root: { fontWeight: 700, color: colours.highlight } }}>
                Transactions
              </Text>
              <Text variant="xxLarge" styles={{ root: { fontWeight: 700 } }}>
                {summary.totalCount.toLocaleString('en-GB')}
              </Text>
            </Stack>

            {/* Metrics Row */}
            <Stack horizontal tokens={{ childrenGap: 30 }}>
              {/* Processed */}
              <Stack styles={metricItemStyle}>
                <Text variant="large" styles={{ root: { color: colours.green } }}>
                  Processed
                </Text>
                <Text variant="xLarge" styles={{ root: { fontWeight: 600 } }}>
                  {summary.processedCount.toLocaleString('en-GB')} (
                  {summary.processedTotal.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP',
                  })}
                  )
                </Text>
              </Stack>

              {/* Pending */}
              <Stack styles={metricItemStyle}>
                <Text variant="large" styles={{ root: { color: colours.yellow } }}>
                  Pending
                </Text>
                <Text variant="xLarge" styles={{ root: { fontWeight: 600 } }}>
                  {summary.pendingCount.toLocaleString('en-GB')} (
                  {summary.pendingTotal.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP',
                  })}
                  )
                </Text>
              </Stack>

              {/* Total Amount */}
              <Stack styles={metricItemStyle}>
                <Text variant="large" styles={{ root: { color: isDarkMode ? '#ccc' : '#333' } }}>
                  Total Amount
                </Text>
                <Text variant="xLarge" styles={{ root: { fontWeight: 600 } }}>
                  {summary.grandTotal.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP',
                  })}
                </Text>
              </Stack>
            </Stack>
          </div>

          {/* Chart Box (no label on top) */}
          {monthlyData.length > 0 && (
            <div className={chartBoxStyle(isDarkMode)}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#555' : '#ccc'} />
                  <XAxis dataKey="month" stroke={isDarkMode ? '#fff' : '#333'} />
                  <YAxis
                    stroke={isDarkMode ? '#fff' : '#333'}
                    tickFormatter={(val: number) =>
                      val.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
                    }
                  />
                  <Tooltip
                    wrapperStyle={{
                      backgroundColor: isDarkMode ? '#333' : '#fff',
                    }}
                    formatter={(value: number) =>
                      value.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
                    }
                  />
                  <Bar dataKey="total" fill={colours.highlight} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Separator and Transactions Grid */}
        <Separator />
        <div style={{ marginTop: '20px' }}>
          {matterTransactions.length === 0 ? (
            <Text variant="medium" styles={{ root: { color: isDarkMode ? '#ccc' : '#666' } }}>
              No transactions available for this matter.
            </Text>
          ) : (
            <div className={transactionsGridStyle}>
              {matterTransactions
                .sort(
                  (a, b) =>
                    new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
                )
                .map((transaction) => (
                  <TransactionCard key={transaction.transaction_id} transaction={transaction} />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MatterTransactions;
