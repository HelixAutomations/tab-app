// src/tabs/transactions/OutstandingBalanceDetails.tsx
// invisible change
import React from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Link } from '@fluentui/react/lib/Link';
import { Separator } from '@fluentui/react/lib/Separator';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { OutstandingClientBalance, Matter } from '../../app/functionality/types';

interface OutstandingBalanceDetailsProps {
  balance: OutstandingClientBalance;
  matters: Matter[];
}

const containerStyle = mergeStyles({
  padding: '10px',
  backgroundColor: colours.light.sectionBackground,
  borderRadius: 0,
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  marginBottom: '16px'
});

const headerStyle = mergeStyles({
  padding: '8px',
  borderBottom: `1px solid ${colours.light.border}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
});

const mattersContainerStyle = mergeStyles({
  padding: '4px 8px',
  marginTop: '4px',
  marginBottom: '4px'
});

const matterLinkStyle = mergeStyles({
  fontWeight: 400,
  fontSize: '14px',
  textDecoration: 'none',
  color: colours.highlight
});

const getBillContainerStyle = (index: number) =>
  mergeStyles({
    backgroundColor: index % 2 === 0 ? '#ffffff' : 'rgba(244,244,246,0.4)',
    padding: '8px',
    marginTop: '8px',
    borderRadius: '4px'
  });

const verticalEquationStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'flex-start'
});

const horizontalSeparatorStyle = mergeStyles({
  margin: '4px 0',
  borderTop: `1px solid ${colours.light.border}`,
  width: '100%'
});

const dateTextStyle = {
  color: '#555',
  fontSize: '14px'
};

const overdueStyle = mergeStyles({
  color: 'red',
  fontWeight: 600,
  fontSize: '14px'
});

const paymentStyle = mergeStyles({
  fontWeight: 600,
  fontSize: '14px'
});

// Compute due status, as in your list version.
const computeDueStatus = (bill: any): string => {
  const today = new Date();
  const dueDate = new Date(bill.due_at);
  const diffTime = today.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} overdue`;
  } else if (diffDays < 0) {
    return `Due in ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`;
  } else {
    return 'Due today';
  }
};

const OutstandingBalanceDetails: React.FC<OutstandingBalanceDetailsProps> = ({ balance, matters }) => {
  // Get matters for the client by matching associated matter IDs.
  const clientMatters = matters.filter(matter =>
    balance.associated_matter_ids.includes(Number(matter.UniqueID))
  );

  return (
    <div className={containerStyle}>
      {/* Client Header */}
      <div className={headerStyle}>
        <Text style={{ fontWeight: 600 }}>
          {balance.contact?.name || 'Unknown Client'}
        </Text>
        <Text style={{ color: 'red', fontWeight: 700 }}>
          £{balance.total_outstanding_balance.toFixed(2)}
        </Text>
      </div>

      {/* Matters Section (if any) */}
      {clientMatters.length > 0 && (
        <div className={mattersContainerStyle}>
          <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
            {clientMatters.map((matter) => (
              <Link
                key={matter.UniqueID}
                href={`https://eu.app.clio.com/nc/#/matters/${matter.UniqueID}`}
                target="_blank"
                className={matterLinkStyle}
              >
                {matter.DisplayNumber}
              </Link>
            ))}
          </Stack>
        </div>
      )}
      <Separator styles={{ root: { margin: '8px 0' } }} />
      
      {/* Bills Section */}
      {balance.outstanding_bills.map((bill: any, index: number) => (
        <div key={bill.id} className={getBillContainerStyle(index)}>
          <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="start" styles={{ root: { justifyContent: 'space-between' } }}>
            {/* Bill ID and Overdue Info */}
            <Stack horizontal tokens={{ childrenGap: 4 }} verticalAlign="start">
              <Link
                href={`https://eu.app.clio.com/nc/#/bills/${bill.id}`}
                target="_blank"
                className={matterLinkStyle}
              >
                {bill.number}
              </Link>
              <Text className={overdueStyle}>- {computeDueStatus(bill)}</Text>
            </Stack>
            {/* Payment Equation */}
            <div className={verticalEquationStyle}>
              <Text className={paymentStyle}>Total: £{bill.total?.toFixed(2)}</Text>
              {bill.paid > 0 && (
                <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
                  <TooltipHost
                    content={
                      <div>
                        <Text>Last Payment: {new Date(bill.paid_at).toLocaleDateString()}</Text>
                        <Text style={{ color: 'green', fontWeight: 600 }}>
                          Amount: £{bill.paid.toFixed(2)}
                        </Text>
                      </div>
                    }
                    calloutProps={{ gapSpace: 0 }}
                  >
                    <Icon iconName="Info" style={{ cursor: 'pointer' }} />
                  </TooltipHost>
                  <Text className={paymentStyle} style={{ color: 'green' }}>
                    - Paid: £{bill.paid.toFixed(2)}
                  </Text>
                </Stack>
              )}
              <div className={horizontalSeparatorStyle} />
              <Text className={paymentStyle}>
                Balance: £{bill.due?.toFixed(2)}
              </Text>
            </div>
          </Stack>
          <Stack tokens={{ childrenGap: 4 }} style={dateTextStyle}>
            <Text>Issued: {new Date(bill.issued_at).toLocaleDateString()}</Text>
            <Text>Due: {new Date(bill.due_at).toLocaleDateString()}</Text>
          </Stack>
        </div>
      ))}
    </div>
  );
};

export default OutstandingBalanceDetails;
