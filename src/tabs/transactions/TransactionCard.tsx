import React from 'react';
// invisible change removed
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Text } from '@fluentui/react/lib/Text';
import { Stack } from '@fluentui/react/lib/Stack';
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { Icon } from '@fluentui/react/lib/Icon';
import { Transaction } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

interface TransactionCardProps {
  transaction: Transaction;
  onClick?: () => void; // Add onClick as an optional prop
}

const cardContainer = (isDarkMode: boolean, status?: string | null) =>
  mergeStyles({
    backgroundColor: isDarkMode
      ? colours.dark.cardBackground
      : colours.light.cardBackground,
    borderRadius: 0,
    boxShadow: isDarkMode
      ? '0 2px 8px rgba(0,0,0,0.6)'
      : '0 2px 8px rgba(0,0,0,0.1)',
    borderLeft: `6px solid ${
      status?.toLowerCase() === 'transfer' // Changed from 'processed' to 'transfer'
        ? colours.green
        : status
        ? colours.yellow
        : 'transparent'
    }`,
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
    fontSize: '13px',
    selectors: {
      ':hover': {
        transform: 'scale(1.02)',
        boxShadow: isDarkMode
          ? '0 4px 12px rgba(0,0,0,0.8)'
          : '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 1,
      },
      ':hover .transaction-details': {
        maxHeight: '200px',
        padding: '12px',
      },
    },
  });

const headerStyle = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
});

const detailsStyle = mergeStyles({
  maxHeight: 0,
  padding: '0 12px',
  overflow: 'hidden',
  transition: 'max-height 0.4s ease-in-out, padding 0.4s ease-in-out',
  backgroundColor: 'inherit',
});

const separatorStyle = mergeStyles({
  borderTop: `1px solid ${colours.grey}`,
  margin: '8px 0',
});

const backdropIconStyle = mergeStyles({
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  right: '12px',
  fontSize: '40px',
  opacity: 0.3,
  pointerEvents: 'none',
  zIndex: -1,
  color: colours.grey,
});

const rowStyle = mergeStyles({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '12px',
});

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-GB');

const formatCurrency = (amount: number): string =>
  amount.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });

const TransactionCard: React.FC<TransactionCardProps> = ({ transaction, onClick }) => {
  const { isDarkMode } = useTheme();

  // Convert "requested" to "pending" for display
  const displayStatus =
    transaction.status?.toLowerCase() === 'requested'
      ? 'pending'
      : transaction.status;

  return (
    <div
      className={`ms-Card ${cardContainer(isDarkMode, transaction.status)}`}
      onClick={onClick} // Apply the onClick handler
      style={{ cursor: onClick ? 'pointer' : 'default' }} // Show pointer cursor if clickable
    >
      {/* Collapsed Header: Matter Ref & Amount */}
      <div className={headerStyle}>
        <Text
          variant="smallPlus"
          styles={{
            root: {
              fontWeight: 600,
              fontSize: '13px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          {transaction.matter_ref}
        </Text>
        <Text
          variant="smallPlus"
          styles={{
            root: {
              fontWeight: 400,
              fontSize: '13px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            },
          }}
        >
          {formatCurrency(transaction.amount)}
        </Text>
      </div>

      {/* Hover Expansion */}
      <div className={`transaction-details ${detailsStyle}`}>
        <div className={separatorStyle} />
        <Stack tokens={{ childrenGap: 6 }}>
          {/* Row 1: Date and Fee Earner */}
          <div className={rowStyle}>
            <TooltipHost content="Date">
              <Text variant="small">
                <strong>Date:</strong> {formatDate(transaction.transaction_date)}
              </Text>
            </TooltipHost>
            <TooltipHost content="Fee Earner">
              <Text variant="small">
                <strong>FE:</strong> {transaction.fe}
              </Text>
            </TooltipHost>
          </div>

          {/* Row 2: Status and Type */}
          <div className={rowStyle}>
            {displayStatus && (
              <TooltipHost content="Status">
                <Text
                  variant="small"
                  styles={{
                    root: {
                      color:
                        displayStatus.toLowerCase() === 'transfer' // Updated to match 'transfer'
                          ? colours.green
                          : colours.yellow,
                      fontWeight: 600,
                    },
                  }}
                >
                  {displayStatus}
                </Text>
              </TooltipHost>
            )}
            <TooltipHost content="Transaction Type">
              <Text variant="small">
                <strong>Type:</strong> {transaction.type}
              </Text>
            </TooltipHost>
          </div>

          {/* Row 3: Money Source */}
          <div className={rowStyle}>
            <TooltipHost content="Money Source">
              <Text
                variant="small"
                styles={{
                  root: {
                    color: transaction.from_client ? colours.green : colours.yellow,
                    fontWeight: 600,
                  },
                }}
              >
                {transaction.from_client
                  ? 'From Client'
                  : `From ${transaction.money_sender || 'Unknown Sender'}`}
              </Text>
            </TooltipHost>
            <div /> {/* Empty div to maintain layout balance */}
          </div>

          {/* Row 4: ID (at the bottom) */}
          <div className={rowStyle}>
            <TooltipHost content="Transaction ID">
              <Text variant="small">
                <strong>ID:</strong> {transaction.transaction_id}
              </Text>
            </TooltipHost>
            <div /> {/* Empty div to maintain layout balance */}
          </div>
        </Stack>
        <Icon iconName="Pound" className={backdropIconStyle} />
      </div>
    </div>
  );
};

export default TransactionCard;