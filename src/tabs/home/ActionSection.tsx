import React, { useState, useMemo } from 'react';
// invisible change 2
import { Text, Toggle, mergeStyles, Icon, Separator } from '@fluentui/react';
import { Transaction, Matter, OutstandingClientBalance } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { cardStyles } from '../instructions/componentTokens';
import { componentTokens } from '../../app/styles/componentTokens';
import TransactionCard from '../transactions/TransactionCard';
import TransactionApprovalPopup from '../transactions/TransactionApprovalPopup';
import BespokePanel from '../../app/functionality/BespokePanel';
import OutstandingBalanceCard from '../transactions/OutstandingBalanceCard';

interface ActionSectionProps {
  transactions: Transaction[];
  userInitials: string;
  isDarkMode: boolean;
  onTransactionClick: (transaction: Transaction) => void;
  matters: Matter[];
  updateTransaction: (updatedTransaction: Transaction) => void;
  // NEW: Prop for outstanding balances (already filtered to only the user's balances)
  outstandingBalances: OutstandingClientBalance[];
}

const transfersGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '20px',
  width: '100%',
});

const balancesGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
  gap: '20px',
  width: '100%',
});

const noActionsClass = mergeStyles({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

const CollapsibleSection: React.FC<{
  title: string;
  children: React.ReactNode;
  isDarkMode: boolean;
  defaultCollapsed?: boolean;
  labels?: string[];
}> = ({ title, children, isDarkMode, defaultCollapsed = false, labels = [] }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggleCollapse = () => setCollapsed(!collapsed);
  const trayHeight = 50;
  const labelArray = labels;


  return (
    <div
      style={{
        marginBottom: '20px',
        boxShadow: (cardStyles.root as React.CSSProperties).boxShadow,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={toggleCollapse}
        style={{
          backgroundColor: colours.darkBlue,
          color: '#ffffff',
          border: `1px solid ${colours.light.border}`,
          padding: '6px 10px',
          minHeight: '30px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '14px',
          borderRadius: 0,
        }}
      >
        <span style={{ fontWeight: 600 }}>{title}</span>
        <Icon
          iconName="ChevronDown"
          styles={{
            root: {
              fontSize: '16px',
              transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.3s ease',
            },
          }}
        />
      </div>
      <div
        style={{
          padding: collapsed ? '6px 10px' : componentTokens.summaryPane.base.padding,
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
          boxShadow: componentTokens.summaryPane.base.boxShadow,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          maxHeight: collapsed ? trayHeight : '2000px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease, opacity 0.3s ease',
        }}
      >
        {collapsed ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              fontSize: '12px',
            }}
          >
            {labelArray.map((label, idx) => (
              <span
                key={idx}
                style={{
                  backgroundColor: colours.tagBackground,
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {label}
              </span>
            ))}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

const ActionSection: React.FC<ActionSectionProps> = ({
  transactions,
  userInitials,
  isDarkMode,
  onTransactionClick,
  matters,
  updateTransaction,
  outstandingBalances,
}) => {
  // ----------------- Transfers Section -----------------
  const [showOnlyMine, setShowOnlyMine] = useState(true);
  const [isTransactionPopupOpen, setIsTransactionPopupOpen] = useState<boolean>(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Treat user "LZ" as "AC" for filtering purposes
  const effectiveInitials = userInitials.toLowerCase() === 'lz' ? 'ac' : userInitials;

  const filteredTransactions = useMemo(() => {
    const relevantTransactions = transactions.filter(
      (tx) => ['requested', 'transfer'].includes((tx.status || '').toLowerCase())
    );
    if (showOnlyMine) {
      return relevantTransactions.filter(
        (tx) => (tx.fe || '').toLowerCase() === effectiveInitials.toLowerCase()
      );
    }
    return relevantTransactions;
  }, [transactions, effectiveInitials, showOnlyMine]);

  const defaultCollapsed = filteredTransactions.length === 0 && showOnlyMine;

  const handleTransactionClickInternal = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setIsTransactionPopupOpen(true);
  };

  const handleTransactionSubmit = (
    values: { transferRequested: boolean; customAmount?: number; transferCustom?: boolean },
    updatedTx: Transaction
  ) => {
    updateTransaction(updatedTx);
  };

  // ----------------- Helper Function -----------------
  // Compute due status for a bill
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
  const outerLabels = [
    `${filteredTransactions.length} transfer${filteredTransactions.length === 1 ? '' : 's'}`,
    `${outstandingBalances.length} balance${outstandingBalances.length === 1 ? '' : 's'}`,
  ];

  return (
    <CollapsibleSection
      title="Transfers and Outstanding Balances"
      isDarkMode={isDarkMode}
      defaultCollapsed={defaultCollapsed}
      labels={outerLabels}
    >
      {/* ---------- Transfers ---------- */}
      <Text variant="large" styles={{ root: { fontWeight: 600, marginBottom: '10px' } }}>
        Transfers
      </Text>
      <Toggle
        checked={showOnlyMine}
        onText="Mine"
        offText="All"
        onChange={(e, checked) => setShowOnlyMine(!!checked)}
        styles={{ root: { marginBottom: '10px' } }}
      />
      {filteredTransactions.length === 0 ? (
        <div className={noActionsClass}>
          <Icon iconName="CompletedSolid" styles={{ root: { fontSize: '16px', color: colours.green } }} />
          <Text>No transfers require action at this time.</Text>
        </div>
      ) : (
          <div className={transfersGridStyle}>
          {filteredTransactions.map((tx) => (
            <TransactionCard
              key={tx.transaction_id}
              transaction={tx}
              onClick={() => handleTransactionClickInternal(tx)}
            />
          ))}
        </div>
      )}

      <BespokePanel
        isOpen={isTransactionPopupOpen}
        onClose={() => setIsTransactionPopupOpen(false)}
        title="Approve Transaction"
        width="2000px"
      >
        {selectedTransaction && (
          <TransactionApprovalPopup
            transaction={selectedTransaction}
            matters={matters}
            onSubmit={handleTransactionSubmit}
            onCancel={() => setIsTransactionPopupOpen(false)}
            userInitials={userInitials}
          />
        )}
      </BespokePanel>

      <Separator styles={{ root: { marginTop: 20, marginBottom: 20 } }} />

      {/* ---------- Outstanding Balances Sub-Section ---------- */}
      <CollapsibleSection
        title="Outstanding Balances"
        isDarkMode={isDarkMode}
        defaultCollapsed={true}
        labels={[`${outstandingBalances.length} record${outstandingBalances.length === 1 ? '' : 's'}`]}
      >
        {outstandingBalances.length === 0 ? (
          <div className={noActionsClass}>
            <Icon iconName="CompletedSolid" styles={{ root: { fontSize: '16px', color: colours.green } }} />
            <Text>No outstanding balances found.</Text>
          </div>
        ) : (
            <div className={balancesGridStyle}>
            {outstandingBalances.map((bal) => (
              <OutstandingBalanceCard
                key={bal.id}
                balanceRecord={bal}
                matters={matters}
                computeDueStatus={computeDueStatus}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
};

export default ActionSection;
