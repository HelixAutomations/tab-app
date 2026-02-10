import React, { useState } from 'react';
// invisible change removed
import { Stack, Text, Spinner, MessageBar, MessageBarType, DefaultButton, IButtonStyles, TextField, ITextFieldStyles } from '@fluentui/react';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import { Transaction, Matter } from '../../app/functionality/types';
import { colours } from '../../app/styles/colours';
import { debugLog, debugWarn } from '../../utils/debug';

// Button styles
const selectionStyles: IButtonStyles = {
  root: {
    padding: '16px 28px',
    borderRadius: '10px',
    backgroundColor: colours.grey,
    border: 'none',
    height: '70px',
    width: '220px',
    fontWeight: 600,
    fontSize: '18px',
    color: colours.greyText,
    transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rootHovered: {
    backgroundColor: colours.highlight,
    color: '#ffffff',
    boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
    transform: 'translateY(-3px)',
  },
  rootPressed: {
    backgroundColor: `${colours.highlight}cc`,
    color: '#ffffff',
    boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
    transform: 'translateY(2px)',
  },
};

// Custom amount field styles aligned with buttons
const customAmountStyles: Partial<ITextFieldStyles> = {
  fieldGroup: {
    borderRadius: '10px',
    border: `1px solid ${colours.grey}`,
    height: '70px',
    width: '300px',
    padding: '0 16px',
    backgroundColor: colours.grey,
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  },
  prefix: {
    background: '#ffffff',
    border: `1px solid ${colours.grey}`,
    borderRadius: '6px',
    padding: '2px 8px',
    marginRight: 8,
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
    transform: 'translateY(-6px)',
  },
  field: {
    fontSize: '18px',
    color: colours.greyText,
    fontWeight: 600,
    marginTop: 6,
  },
};

interface TransactionApprovalPopupProps {
  transaction: Transaction;
  matters: Matter[];
  onSubmit: (values: { transferRequested: boolean; customAmount?: number; transferCustom?: boolean }, updatedTransaction: Transaction) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  userInitials: string;
}

const TransactionApprovalPopup: React.FC<TransactionApprovalPopupProps> = ({
  transaction,
  matters,
  onSubmit,
  onCancel,
  isSubmitting = false,
  userInitials,
}) => {
  const matter = matters.find((m) => m.DisplayNumber === transaction.matter_ref);
  const matterId = matter?.UniqueID || '';
  const clioLink = `https://eu.app.clio.com/nc/#/matters/${matterId}`;

  const [selectedOption, setSelectedOption] = useState<'leave' | 'transfer' | 'transfer_custom' | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(transaction.status || 'requested'); // Local state for status animation

  const formatDate = (dateStr: string): string =>
    new Date(dateStr).toLocaleDateString('en-GB');

  const formatCurrency = (amount: number): string =>
    amount.toLocaleString('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 2,
    });

  const handleSubmit = async () => {
    setIsLoading(true);
    setSubmitStatus(null);
    setErrorMessage(null);

    const submissionValues = {
      transaction_id: transaction.transaction_id,
      transferRequested: selectedOption === 'transfer' || selectedOption === 'transfer_custom',
      customAmount: selectedOption === 'transfer_custom' ? parseFloat(customAmount) || undefined : undefined,
      transferCustom: selectedOption === 'transfer_custom',
      user_initials: userInitials,
      matter_ref: transaction.matter_ref,
      amount: transaction.amount,
      matterId: matterId, // Add matterId to the payload
    };

    try {
      // Optimistically update the status to 'transfer' for the animation
      setLocalStatus('transfer');

        const response = await fetch(
          `${getProxyBaseUrl()}/${process.env.REACT_APP_UPDATE_TRANSACTIONS_PATH}?code=${process.env.REACT_APP_UPDATE_TRANSACTIONS_CODE}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([submissionValues]),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update transaction: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      debugLog("Update successful:", result);
      setSubmitStatus('success');

      // Update the transaction status in the parent component
      const updatedTransaction = { ...transaction, status: 'transfer' };
      onSubmit(submissionValues, updatedTransaction);

      // Delay closing the panel to show the animation and confirmation
      setTimeout(() => {
        onCancel(); // Close the panel after 2 seconds
      }, 2000);
    } catch (error) {
      debugWarn("Error updating transaction:", error);
      setSubmitStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setIsLoading(false); // Allow retry on error
    }
  };

  const handleOptionSelect = (option: 'leave' | 'transfer' | 'transfer_custom') => {
    setSelectedOption(option);
    if (option !== 'transfer_custom') setCustomAmount('');
  };

  const getButtonStyles = (isSelected: boolean): IButtonStyles => ({
    root: {
      padding: '16px 28px',
      borderRadius: '10px',
      backgroundColor: isSelected ? colours.highlight : colours.grey,
      border: 'none',
      height: '70px',
      width: '220px',
      fontWeight: 600,
      fontSize: '18px',
      color: isSelected ? '#ffffff' : colours.greyText,
      transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease',
      boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },
    rootHovered: selectionStyles.rootHovered,
    rootPressed: selectionStyles.rootPressed,
  });

  const isConfirmDisabled = selectedOption === 'transfer_custom' && (!customAmount || parseFloat(customAmount) <= 0 || parseFloat(customAmount) > transaction.amount);

  // Determine status color based on local status
  const statusColor = localStatus?.toLowerCase() === 'transfer' ? colours.green : colours.yellow;
  const displayStatus = localStatus?.toLowerCase() === 'requested' ? 'pending' : localStatus;

  return (
    <Stack
      tokens={{ childrenGap: 30 }}
      styles={{
        root: {
          padding: '30px',
          width: '100%',
          maxWidth: '1000px',
          boxSizing: 'border-box',
        },
      }}
    >
      {/* Instructions in Info Box */}
      <Stack
        tokens={{ childrenGap: 10 }}
        styles={{
          root: {
            textAlign: 'left',
            backgroundColor: '#f8f9fa',
            border: `1px solid ${colours.grey}`,
            borderRadius: '8px',
            padding: '20px',
            width: '100%',
          },
        }}
      >
        <Text styles={{ root: { fontSize: '18px', fontWeight: 600, color: colours.greyText } }}>
          Transaction Approval
        </Text>
        <Text styles={{ root: { fontSize: '16px', color: colours.greyText, lineHeight: '1.5' } }}>
          Please review the transaction details below and choose an action:
        </Text>
        <Text styles={{ root: { fontSize: '16px', color: colours.greyText, lineHeight: '1.5' } }}>
          - <strong>Leave in Client:</strong> Keep the funds in the client account.<br />
          - <strong>Request Transfer:</strong> Approve the transfer of the full amount.<br />
          - <strong>Transfer Custom Amount:</strong> Specify a custom amount to transfer.
        </Text>
      </Stack>

      {/* Transaction Details and Actions Section */}
      <Stack
        tokens={{ childrenGap: 30 }}
        styles={{
          root: {
            textAlign: 'left',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            padding: '20px',
            position: 'relative',
            width: '100%',
          },
        }}
      >
        {/* Status Indicator in Top-Right Corner */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            backgroundColor: statusColor,
            color: '#ffffff',
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'capitalize',
            transition: 'background-color 0.5s ease',
          }}
        >
          {displayStatus}
        </div>

        {/* Transaction Details */}
        <Stack tokens={{ childrenGap: 16 }}>
          <Text variant="mediumPlus" styles={{ root: { color: colours.greyText } }}>
            <strong>Date of Transaction:</strong> {formatDate(transaction.transaction_date)}
          </Text>
          <Text variant="mediumPlus" styles={{ root: { color: colours.greyText } }}>
            <strong>Matter Reference:</strong>{' '}
            <a
              href={clioLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: colours.highlight }}
            >
              {transaction.matter_ref}
            </a>{' '}
            - <strong>Amount:</strong> {formatCurrency(transaction.amount)}
          </Text>
          <Text variant="mediumPlus" styles={{ root: { color: colours.greyText } }}>
            <strong>Transaction Type:</strong> {transaction.type}<br />
            <strong>From:</strong>{' '}
            {transaction.from_client ? 'Client' : transaction.money_sender || 'Unknown Sender'}
          </Text>
        </Stack>

        {/* Selection Buttons */}
        <Stack
          horizontal
          tokens={{ childrenGap: 24 }}
          styles={{
            root: {
              justifyContent: 'center',
              width: '100%',
              maxWidth: '720px',
              margin: '0 auto',
            },
          }}
        >
          <DefaultButton
            text="Leave in Client"
            onClick={() => handleOptionSelect('leave')}
            styles={getButtonStyles(selectedOption === 'leave')}
          />
          <DefaultButton
            text="Request Transfer"
            onClick={() => handleOptionSelect('transfer')}
            styles={getButtonStyles(selectedOption === 'transfer')}
          />
          <DefaultButton
            text="Transfer Custom Amount"
            onClick={() => handleOptionSelect('transfer_custom')}
            styles={getButtonStyles(selectedOption === 'transfer_custom')}
          />
        </Stack>

        {/* Custom Amount Input */}
        {selectedOption === 'transfer_custom' && (
          <Stack
            tokens={{ childrenGap: 10 }}
            styles={{ root: { alignItems: 'center', maxWidth: '720px', margin: '0 auto' } }}
          >
            <TextField
              label="Custom Amount"
              prefix="£"
              value={customAmount}
              onChange={(_, newValue) => setCustomAmount(newValue || '')}
              styles={customAmountStyles}
              placeholder={`Max: ${formatCurrency(transaction.amount)}`}
              type="number"
              min={0}
              max={transaction.amount}
            />
            <Text styles={{ root: { fontSize: '14px', color: colours.greyText } }}>
              Enter an amount up to {formatCurrency(transaction.amount)}
            </Text>
          </Stack>
        )}

        {/* Confirmation Buttons */}
        {selectedOption && !submitStatus && (
          <Stack
            horizontal
            tokens={{ childrenGap: 20 }}
            styles={{
              root: {
                justifyContent: 'center',
                width: '100%',
                maxWidth: '464px',
                margin: '0 auto',
              },
            }}
          >
            <DefaultButton
              text={isLoading ? "Processing..." : "Confirm"}
              onClick={handleSubmit}
              disabled={isConfirmDisabled || isLoading || isSubmitting}
              styles={{
                root: {
                  padding: '16px 28px',
                  borderRadius: '10px',
                  backgroundColor: isLoading ? `${colours.green}33` : colours.highlight,
                  border: isLoading ? `2px solid ${colours.green}` : 'none',
                  height: '70px',
                  width: '220px',
                  fontWeight: 600,
                  fontSize: '18px',
                  color: '#ffffff',
                  transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.2s ease',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                },
                rootHovered: selectionStyles.rootHovered,
                rootPressed: selectionStyles.rootPressed,
              }}
            />
            <DefaultButton
              text="Cancel"
              onClick={onCancel}
              styles={getButtonStyles(false)}
              disabled={isLoading}
            />
          </Stack>
        )}
      </Stack>

      {/* Loading and Status Messages */}
      {isLoading && !submitStatus && (
        <Stack horizontalAlign="center">
          <Spinner label="Processing transaction..." labelPosition="right" styles={{ label: { color: colours.green } }} />
        </Stack>
      )}

      {submitStatus === 'success' && (
        <MessageBar messageBarType={MessageBarType.success}>
          Transfer has been requested successfully!
        </MessageBar>
      )}

      {submitStatus === 'error' && (
        <MessageBar messageBarType={MessageBarType.error}>
          {errorMessage || 'Failed to update transaction.'}
        </MessageBar>
      )}
    </Stack>
  );
};

export default TransactionApprovalPopup;