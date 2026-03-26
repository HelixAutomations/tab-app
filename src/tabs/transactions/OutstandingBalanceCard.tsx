import React, { useState } from 'react';
// invisible change removed
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { Link } from '@fluentui/react/lib/Link';
import { Separator } from '@fluentui/react/lib/Separator';
import { Icon } from '@fluentui/react/lib/Icon';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../app/styles/colours';
import { OutstandingClientBalance, Matter } from '../../app/functionality/types';

/**
 * Props for a single outstanding balance card.
 */
interface OutstandingBalanceCardProps {
  balanceRecord: OutstandingClientBalance;  // The record for this client
  matters: Matter[];                       // All matters (or only user matters)
  computeDueStatus: (bill: any) => string; // A helper function from your code
}

const containerStyle = mergeStyles({
  padding: '10px',
  backgroundColor: colours.light.sectionBackground,
  borderRadius: 0,
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  marginBottom: '16px',
  position: 'relative',
  transition: 'all 0.3s ease',
  fontSize: '13px',
});

const headerStyle = mergeStyles({
  padding: '10px',
  borderBottom: `1px solid ${colours.light.border}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

const mattersContainerStyle = mergeStyles({
  padding: '4px 8px',
  marginTop: '4px',
  marginBottom: '4px',
});

const matterLinkStyle = mergeStyles({
  fontWeight: 400,
  fontSize: '13px',
  textDecoration: 'none',
  color: colours.highlight,
});

// We'll always render the bills container and animate its reveal:
const billsContainerBaseStyle = mergeStyles({
  overflow: 'hidden',
  transition: 'max-height 0.4s ease-in-out, padding 0.4s ease-in-out, opacity 0.4s ease-in-out',
});

// Use a helper function to create alternating background styles for bills:
const getBillContainerStyle = (index: number) =>
  mergeStyles({
    backgroundColor: index % 2 === 0 ? '#ffffff' : 'rgba(244,244,246,0.4)',
    padding: '8px',
    marginTop: '8px',
    borderRadius: 0,
  });

const verticalEquationStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
});

const horizontalSeparatorStyle = mergeStyles({
  margin: '4px 0',
  borderTop: `1px solid ${colours.light.border}`,
  width: '100%',
});

const dateTextStyle: React.CSSProperties = {
  color: '#555',
  fontSize: '13px',
};

const overdueStyle = mergeStyles({
  color: 'red',
  fontWeight: 600,
  fontSize: '13px',
});

const paymentStyle = mergeStyles({
  fontWeight: 600,
  fontSize: '13px',
});

const OutstandingBalanceCard: React.FC<OutstandingBalanceCardProps> = ({
  balanceRecord,
  matters,
  computeDueStatus,
}) => {
  // Track hover state so we can animate the bills reveal.
  const [isHovered, setIsHovered] = useState(false);

  // Filter the matters for this client.
  const relevantMatters = matters.filter((m) =>
    balanceRecord.associated_matter_ids.includes(Number(m.UniqueID))
  );

  // Bill details.
  const bills = balanceRecord.outstanding_bills || [];

  // Dynamic style for the bills container.
  const billsContainerStyle = mergeStyles(billsContainerBaseStyle, {
    maxHeight: isHovered ? '1000px' : '0px',  // Use a high enough maxHeight for full content
    padding: isHovered ? '8px 0' : '0 0',
    opacity: isHovered ? 1 : 0,
  });

  return (
    <div
      className={containerStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* HEADER */}
      <div className={headerStyle}>
        <Text style={{ fontWeight: 600, fontSize: '13px' }}>
          {balanceRecord.contact?.name || 'Unknown Client'}
        </Text>
        <Text style={{ color: 'red', fontWeight: 700, fontSize: '13px' }}>
          £{balanceRecord.total_outstanding_balance.toFixed(2)}
        </Text>
      </div>

      {/* Matters */}
      {relevantMatters.length > 0 && (
        <div className={mattersContainerStyle}>
          <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="center">
            {relevantMatters.map((mat) => (
              <Link
                key={mat.UniqueID}
                href={`https://eu.app.clio.com/nc/#/matters/${mat.UniqueID}`}
                target="_blank"
                className={matterLinkStyle}
              >
                {mat.DisplayNumber}
              </Link>
            ))}
          </Stack>
        </div>
      )}

      {/* Separator */}
      <Separator styles={{ root: { margin: '8px 0' } }} />

      {/* Bills: Animated Reveal */}
      <div className={billsContainerStyle}>
        {bills.map((bill: any, index: number) => {
          const total = bill.total || 0;
          const paid = bill.paid || 0;
          const balanceAmount = bill.due || 0;
          const dueStatus = computeDueStatus(bill);

          return (
            <div key={bill.id} className={getBillContainerStyle(index)}>
              <Stack
                horizontal
                tokens={{ childrenGap: 8 }}
                verticalAlign="start"
                styles={{ root: { justifyContent: 'space-between' } }}
              >
                <Stack horizontal tokens={{ childrenGap: 4 }} verticalAlign="start">
                  <Link
                    href={`https://eu.app.clio.com/nc/#/bills/${bill.id}`}
                    target="_blank"
                    className={matterLinkStyle}
                  >
                    {bill.number}
                  </Link>
                  <Text className={overdueStyle}>- {dueStatus}</Text>
                </Stack>

                <div className={verticalEquationStyle}>
                  <Text className={paymentStyle}>Total: £{total.toFixed(2)}</Text>
                  {paid > 0 && (
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 4 }}>
                      <TooltipHost
                        content={
                          <div>
                            <Text>
                              Last Payment: {new Date(bill.paid_at).toLocaleDateString()}
                            </Text>
                            <Text style={{ color: 'green', fontWeight: 600 }}>
                              Amount: £{paid.toFixed(2)}
                            </Text>
                          </div>
                        }
                        calloutProps={{ gapSpace: 0 }}
                      >
                        <Icon iconName="Info" style={{ cursor: 'pointer' }} />
                      </TooltipHost>
                      <Text className={paymentStyle} style={{ color: 'green' }}>
                        - Paid: £{paid.toFixed(2)}
                      </Text>
                    </Stack>
                  )}
                  <div className={horizontalSeparatorStyle} />
                  <Text className={paymentStyle}>Balance: £{balanceAmount.toFixed(2)}</Text>
                </div>
              </Stack>

              <Stack tokens={{ childrenGap: 4 }} style={dateTextStyle}>
                <Text style={dateTextStyle}>
                  Issued:{' '}
                  {bill.issued_at ? new Date(bill.issued_at).toLocaleDateString() : 'N/A'}
                </Text>
                <Text style={dateTextStyle}>
                  Due:{' '}
                  {bill.due_at ? new Date(bill.due_at).toLocaleDateString() : 'N/A'}
                </Text>
              </Stack>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OutstandingBalanceCard;
