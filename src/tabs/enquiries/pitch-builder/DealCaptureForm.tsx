import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { addDays } from 'date-fns';
import {
  Stack,
  Text,
  TextField,
  Dropdown,
  IDropdownOption,
  IconButton,
  Icon,
  mergeStyles,
  Label,
} from '@fluentui/react';
import {
  inputFieldStyle,
  dropdownStyle,
  amountContainerStyle,
  prefixStyle,
  amountInputStyle,
} from '../../../CustomForms/BespokeForms';
// invisible change
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import { Enquiry } from '../../../app/functionality/types';
import PaymentPreview from './PaymentPreview';

interface ClientInfo {
  firstName: string;
  lastName: string;
  email: string;
}

interface DealCaptureFormProps {
  enquiry: Enquiry;
  onSubmit: (data: {
    serviceDescription: string;
    amount: number;
    dealExpiry: string;
    isMultiClient: boolean;
    clients: ClientInfo[];
  }) => void;
  areaOfWork?: string;
  enquiryId?: string | number;
  dealId?: string | number | null;
  clientIds?: (string | number)[];
  onAmountChange?: (val: string) => void;
  onAmountBlur?: (val: string) => void;
  serviceDescription: string;
  setServiceDescription: (val: string) => void;
  selectedOption: IDropdownOption | undefined;
  setSelectedOption: (opt: IDropdownOption | undefined) => void;
  onDescriptionHeightChange?: (height: number) => void;
  /**
   * Notify parent components when the saved/completion state changes
   */
  onSavedChange?: (saved: boolean) => void;
}

// Service options, 'Other' triggers bespoke input
const SERVICE_OPTIONS: IDropdownOption[] = [
  { key: 'Shareholder Dispute', text: 'Shareholder Dispute' },
  { key: 'Debt Recovery (Pre-Litigation)', text: 'Debt Recovery (Pre-Litigation)' },
  { key: 'Debt Recovery (Enforcement)', text: 'Debt Recovery (Enforcement)' },
  { key: 'Commercial Contract Drafting', text: 'Commercial Contract Drafting' },
  { key: 'Contract Negotiation Support', text: 'Contract Negotiation Support' },
  { key: 'Regulatory Compliance Advisory', text: 'Regulatory Compliance Advisory' },
  { key: 'Data Protection & GDPR Consultancy', text: 'Data Protection & GDPR Consultancy' },
  { key: 'Other', text: 'Other (bespoke)' },
];

function formatCurrency(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
  if (isNaN(num) || num === 0) return '£0.00';
  return num.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

const DealCaptureForm: React.FC<DealCaptureFormProps> = ({
  enquiry,
  onSubmit,
  areaOfWork,
  enquiryId,
  dealId,
  clientIds,
  onAmountChange,
  onAmountBlur,
  serviceDescription,
  setServiceDescription,
  selectedOption,
  setSelectedOption,
  onDescriptionHeightChange,
  onSavedChange,
}) => {
  const { isDarkMode } = useTheme();
  const [useBespoke, setUseBespoke] = useState(false);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>();
  const [dealExpiry, setDealExpiry] = useState(
    addDays(new Date(), 14).toISOString().slice(0, 10)
  );
  const [isMultiClient, setIsMultiClient] = useState(false);
  const [clients, setClients] = useState<ClientInfo[]>([{ firstName: '', lastName: '', email: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [amountBlurred, setAmountBlurred] = useState(false);
  const [clientsBlurred, setClientsBlurred] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  // Inform parent components whenever the saved state changes
  useEffect(() => {
    onSavedChange?.(isSaved);
  }, [isSaved, onSavedChange]);

const [clientFieldFocusCount, setClientFieldFocusCount] = useState(0);
const addingClientRef = useRef(false);

  // Service description area height callback for parent
  useLayoutEffect(() => {
    if (descRef.current) {
      onDescriptionHeightChange?.(descRef.current.getBoundingClientRect().height);
    }
  }, [onDescriptionHeightChange, useBespoke, serviceDescription, selectedOption]);

  // Reset client blur state when toggling multi-client mode
  useLayoutEffect(() => {
    setClientsBlurred(false);
  }, [isMultiClient]);

  const vat = amount ? parseFloat(amount.replace(/,/g, '')) * 0.2 : 0;
  const total = amount ? parseFloat(amount.replace(/,/g, '')) + vat : 0;
  const showPaymentInfo =
    amountBlurred &&
    !amountError &&
    !!amount &&
    !isNaN(Number(amount.replace(/,/g, ''))) &&
    Number(amount.replace(/,/g, '')) > 0;

  const showProofInfo =
    isMultiClient &&
    clientsBlurred &&
    clients.every((c) => c.firstName && c.lastName && c.email);

  const showProofInfoSingle = showPaymentInfo && !isMultiClient;
  const showProofInfoMulti =
    showPaymentInfo &&
    isMultiClient &&
    clients.every((c) => c.firstName && c.lastName && c.email);

  const paymentInfoWrapper = (show: boolean) =>
    mergeStyles({
      minHeight: show ? 32 : 0,
      marginTop: show ? 4 : 0,
      marginBottom: show ? 4 : 0,
      width: '100%',
    });

  const paymentInfoClass = (show: boolean, error?: boolean) =>
    mergeStyles({
      maxHeight: show ? 32 : 0,
      opacity: show ? 1 : 0,
      overflow: 'hidden',
      transition: 'max-height 0.2s ease, opacity 0.2s ease',
      borderLeft: `4px solid ${error ? colours.red : colours.cta}`,
      padding: show ? '6px 8px' : '0 8px',
      background: isDarkMode ? colours.dark.cardBackground : colours.grey,
      color: isDarkMode ? colours.dark.text : colours.light.text,
      fontSize: 13,
      width: '100%',
    });



  // Format on blur, accept number while typing
  const handleAmountChange = (_: any, val?: string) => {
    if (!val) {
      setAmount('');
      setAmountError(undefined);
      onAmountChange?.('');
      return;
    }
    // Allow partial valid input while typing (e.g. "4000." or "4,000.5")
    const raw = val.replace(/,/g, '');
    if (raw && !/^\d*\.?\d{0,2}$/.test(raw)) {
      setAmount(val);
      setAmountError('Invalid amount');
      onAmountChange?.(val);
      return;
    }
    setAmount(val);
    setAmountError(undefined);
    onAmountChange?.(val);
  };

  const handleAmountBlur = () => {
    setAmountBlurred(true);
    if (!amount) {
      onAmountBlur?.('');
      return;
    }
    const num = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(num) || num <= 0) {
      setAmountError('Amount must be a positive number');
      onAmountBlur?.(amount);
    } else {
      const formatted = num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setAmount(formatted);
      setAmountError(undefined);
      onAmountBlur?.(formatted);
    }
  };

  const handleSave = () => {
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!serviceDescription || !amount) {
      setError('Service description and amount are required');
      return;
    }
    if (isNaN(num) || num <= 0) {
      setAmountError('Amount must be a positive number');
      setError('Please enter a valid amount');
      return;
    }
    const clientsValid = !isMultiClient || clients.every(
      (c) => c.firstName && c.lastName && c.email
    );
    if (!clientsValid) {
      setError('Please enter details for all additional clients');
      return;
    }
    setError(null);
    onSubmit({
      serviceDescription,
      amount: num,
      dealExpiry,
      isMultiClient,
      clients,
    });
    setIsSaved(true);
  };

  // Shared card style matching the header sections
  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column' as const,
    width: '100%',
    padding: 8,
    gap: 4,
    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : '#ddd'}`,
    borderRadius: 8,
    backgroundColor: isDarkMode ? colours.dark.cardBackground : '#ffffff',
  };

  const labelStyle = mergeStyles({
    fontWeight: '600',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    paddingBottom: '5px',
  });

  const intakeContainer = mergeStyles(sectionStyle);

  const intakeHeader = mergeStyles({
    color: isDarkMode ? '#fff' : colours.darkBlue,
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 8,
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  });

  // Input fields for client details have a subtle left accent using the
  // same colour as section headers to visually connect them without a
  // full header bar.
  const clientFieldGroupStyle = mergeStyles(inputFieldStyle, {
    borderLeft: `4px solid ${colours.darkBlue}`,
    borderRadius: 0,
  });

  const separatorColour = isDarkMode ? 'rgba(255,255,255,0.1)' : '#ddd';

  const dealFieldsContainer = mergeStyles(sectionStyle, {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 0,
    padding: 0,
    borderRadius: 0,
    selectors: {
      '> div:last-child': { borderRight: 'none' },
    },
  });

  const serviceFieldStyle = mergeStyles({
    flexBasis: '40%',
    flexGrow: 1,
    minWidth: 250,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${separatorColour}`,
  });

  const amountFieldStyle = mergeStyles({
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 180,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    borderRight: `1px solid ${separatorColour}`,
    selectors: {
      '@media (max-width: 610px)': {
        borderRight: 'none',
      },
    },
  });

  const expiryFieldStyle = mergeStyles({
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 180,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    selectors: {
      '@media (max-width: 610px)': {
        borderTop: `1px solid ${separatorColour}`,
      },
    },
  });


  const toggleContainer = mergeStyles({
    display: 'flex',
    border: `1px solid ${colours.darkBlue}`,
    borderRadius: 0,
  overflow: 'hidden',
  cursor: 'pointer',
  width: '100%',
  marginTop: 8,
  marginBottom: 8,
  height: '100%', // allow stretching in parent flex row
  alignItems: 'stretch', // children stretch vertically
});

const toggleHalf = (selected: boolean) =>
  mergeStyles({
    padding: '10px 16px',
    flex: 1,
    height: '100%',
    backgroundColor: selected
      ? colours.darkBlue
      : isDarkMode
      ? colours.dark.inputBackground
      : colours.light.inputBackground,
    color: selected ? '#fff' : isDarkMode ? colours.dark.text : colours.light.text,
    fontWeight: selected ? 600 : 400,
    fontSize: 13,
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s, color 0.2s',
    boxShadow: selected ? `inset 0 0 0 2px ${colours.darkBlue}` : 'none',
  });

  const addClientStyle = mergeStyles({
    color: colours.highlight,
    cursor: 'pointer',
    fontSize: 13,
    marginTop: 6,
    userSelect: 'none',
    selectors: {
      ':hover': { textDecoration: 'underline' },
    },
  });

  const infoTextClass = (show: boolean) =>
    mergeStyles({
      maxHeight: show ? 32 : 0,
      opacity: show ? 1 : 0,
      overflow: 'hidden',
      transition: 'max-height 0.2s ease, opacity 0.2s ease',
      borderLeft: `4px solid ${error ? colours.red : colours.cta}`,
      padding: show ? '6px 8px' : '0 8px',
      marginTop: 4,
      marginBottom: 4,
      background: isDarkMode ? colours.dark.cardBackground : colours.grey,
      color: isDarkMode ? colours.dark.text : colours.light.text,
      fontSize: 13,
      width: '100%',
    });

  const toggleFreehandStyle = mergeStyles({
    color: colours.greyText,
    cursor: 'pointer',
    fontSize: 12,
    marginTop: 6,
    selectors: {
      ':hover': { color: colours.highlight },
    },
  });

  const allClientFieldsFilled = clients.every(
    (c) => c.firstName && c.lastName && c.email
  );

  // 1. Auto-save only when blurred
useLayoutEffect(() => {
  const num = parseFloat(amount.replace(/,/g, ''));
  const validAmount = !isNaN(num) && num > 0;
  const ready =
    amountBlurred &&
    (!isMultiClient || clientsBlurred) &&
    serviceDescription.trim() &&
    dealExpiry &&
    validAmount &&
    (!isMultiClient || allClientFieldsFilled);

  if (ready) {
    if (!isSaved) handleSave();
  } else if (isSaved) {
    setIsSaved(false);
  }
}, [
  amountBlurred,
  clientsBlurred,
  serviceDescription,
  dealExpiry,
  amount,
  isMultiClient,
  clients,
  allClientFieldsFilled,
  isSaved,
]);

  const rootStackStyle = mergeStyles(sectionStyle, {
    height: '100%',
    transition: 'box-shadow 0.2s ease',
    borderRadius: 0,
    selectors: {
      ':hover': {
        boxShadow: isDarkMode
          ? '0 2px 4px rgba(0,0,0,0.3)'
          : '0 2px 4px rgba(0,0,0,0.1)',
      },
    },
  });

  return (
    <Stack tokens={{ childrenGap: 10 }} className={rootStackStyle}>
      {error && <Text style={{ color: 'red' }}>{error}</Text>}

      {/* Service Description, Amount and Expiry */}
      <div className={dealFieldsContainer}>
        <div className={serviceFieldStyle} ref={descRef}>
          {!useBespoke ? (
            <Stack tokens={{ childrenGap: 6 }}>
                <div>
                  <div className={intakeHeader}>Service Description</div>
                  <Dropdown
                    options={SERVICE_OPTIONS}
                    styles={{
                      dropdown: [
                        dropdownStyle,
                        { border: 'none', borderRadius: 0, width: '100%' },
                      ],
                    }}
                    selectedKey={selectedOption?.key}
                    onChange={(_, option) => {
                      if (option?.key === 'Other') {
                        setUseBespoke(true);
                        setServiceDescription('');
                        setSelectedOption(undefined);
                      } else {
                        setSelectedOption(option);
                        setServiceDescription(option?.text || '');
                      }
                    }}
                    required
                  />
                </div>
                <span
                  className={toggleFreehandStyle}
                  onClick={() => {
                    setUseBespoke(true);
                    setServiceDescription('');
                    setSelectedOption(undefined);
                  }}
                >
                  Use freehand description
                </span>
              </Stack>
            ) : (
              <Stack>
                <div>
                  <div className={intakeHeader}>Freehand Description</div>
                  <TextField
                    multiline
                    required
                    autoAdjustHeight
                    value={serviceDescription}
                    onChange={(_, v) => setServiceDescription((v || '').slice(0, 200))}
                    styles={{
                      fieldGroup: [inputFieldStyle, { border: 'none', borderRadius: 0, height: 'auto' }],
                      prefix: { paddingBottom: 0, paddingLeft: 4, display: 'flex', alignItems: 'center' },
                  }}
                  maxLength={200}
                />
              </div>
              <Text
                variant="small"
                styles={{ root: { color: colours.greyText, marginTop: 2, marginLeft: 2 } }}
              >
                {serviceDescription.length}/200 characters
              </Text>
              <span
                onClick={() => setUseBespoke(false)}
                style={{
                  color: colours.highlight,
                  cursor: 'pointer',
                  fontSize: 13,
                  marginTop: 6,
                }}
              >
                ← Back to dropdown options
              </span>
            </Stack>
            )}
          </div>
        <div className={amountFieldStyle}>
          <div className={intakeHeader}>Amount (ex. VAT)</div>
          <div className={amountContainerStyle}>
            <span
              className={mergeStyles(prefixStyle, {
                border: 'none',
                  background: 'transparent',
                })}
              >
                £
              </span>
              <TextField
                required
                type="text"
                value={amount}
                onChange={handleAmountChange}
                onBlur={handleAmountBlur}
                styles={{
                  root: { flexGrow: 1 },
                  fieldGroup: amountInputStyle(true),
                }}
                inputMode="decimal"
              />
            </div>
          </div>

        <div className={expiryFieldStyle}>
          <div className={intakeHeader}>Deal Expiry</div>
          <TextField
            type="date"
            value={dealExpiry}
            onChange={(_, v) => setDealExpiry(v || '')}
            styles={{ fieldGroup: [inputFieldStyle, { border: 'none', borderRadius: 0 }] }}
          />
        </div>
      </div>
      <div className={paymentInfoWrapper(showPaymentInfo || !!amountError)}>
        <div className={paymentInfoClass(!!amountError, true)}>
          {amountError || ''}
        </div>
        <div className={paymentInfoClass(showPaymentInfo && !amountError)}>
          {(enquiry.First_Name || 'The client')} will be asked to pay{' '}
          {formatCurrency(Number(amount.replace(/,/g, '')) * 1.2)} on account
        </div>
      </div>

      <PaymentPreview serviceDescription={serviceDescription} amount={amount} />

      <Stack>
        <div className={toggleContainer} aria-label="Select ID type">
          <div
            className={toggleHalf(!isMultiClient)}
            onClick={() => setIsMultiClient(false)}
          >
            <Icon iconName="Contact" styles={{ root: { marginRight: 6 } }} />
            Individual
          </div>
          <div
            className={toggleHalf(isMultiClient)}
            onClick={() => setIsMultiClient(true)}
          >
            <Icon iconName="People" styles={{ root: { marginRight: 6 } }} />
            Multiple Clients
          </div>
        </div>
      </Stack>
      <div className={infoTextClass(isMultiClient)}>
        Enter the name and email address of each additional client.
      </div>
      {isMultiClient && (
        <Stack tokens={{ childrenGap: 8 }}>
          {clients.map((client, index) => (
            <Stack horizontal tokens={{ childrenGap: 10 }} key={index} verticalAlign="end">
              <Stack styles={{ root: { width: '25%' } }}>
                <TextField
                  placeholder="First Name"
                  value={client.firstName}
                  onChange={(_, v) => {
                    const updated = [...clients];
                    updated[index].firstName = v || '';
                    setClients(updated);
                  }}
                  onFocus={() => {
                    setClientsBlurred(false);
                    setClientFieldFocusCount((c) => c + 1);
                  }}
                  onBlur={() => {
                    setClientFieldFocusCount((c) => {
                      const newCount = c - 1;
                      if (
                        !addingClientRef.current &&
                        newCount <= 0 &&
                        clients.every((c) => c.firstName && c.lastName && c.email)
                      ) {
                        setClientsBlurred(true);
                      }
                      return newCount;
                    });
                  }}
                  styles={{ fieldGroup: clientFieldGroupStyle }}
                />
              </Stack>
              <Stack styles={{ root: { width: '25%' } }}>
                <TextField
                  placeholder="Last Name"
                  value={client.lastName}
                  onChange={(_, v) => {
                    const updated = [...clients];
                    updated[index].lastName = v || '';
                    setClients(updated);
                  }}
                  onFocus={() => {
                    setClientsBlurred(false);
                    setClientFieldFocusCount((c) => c + 1);
                  }}
                  onBlur={() => {
                    setClientFieldFocusCount((c) => {
                      const newCount = c - 1;
                      if (
                        !addingClientRef.current &&
                        newCount <= 0 &&
                        clients.every((c) => c.firstName && c.lastName && c.email)
                      ) {
                        setClientsBlurred(true);
                      }
                      return newCount;
                    });
                  }}
                  styles={{ fieldGroup: clientFieldGroupStyle }}
                />
              </Stack>
              <Stack styles={{ root: { width: '50%' } }}>
                <TextField
                  placeholder="Email"
                  value={client.email}
                  onChange={(_, v) => {
                    const updated = [...clients];
                    updated[index].email = v || '';
                    setClients(updated);
                  }}
                  onFocus={() => {
                    setClientsBlurred(false);
                    setClientFieldFocusCount((c) => c + 1);
                  }}
                  onBlur={() => {
                    setClientFieldFocusCount((c) => {
                      const newCount = c - 1;
                      if (
                        newCount <= 0 &&
                        clients.every((c) => c.firstName && c.lastName && c.email)
                      ) {
                        setClientsBlurred(true);
                      }
                      return newCount;
                    });
                  }}
                  styles={{ fieldGroup: clientFieldGroupStyle }}
                />
              </Stack>
              {clients.length > 1 && (
                <IconButton
                  iconProps={{ iconName: 'Delete' }}
                  styles={{
                    root: {
                      marginBottom: 20,
                      marginLeft: 2,
                      color: '#d13438', // red
                    }
                  }}
                  ariaLabel="Remove client"
                  onClick={() => setClients(clients.filter((_, i) => i !== index))}
                />
              )}
            </Stack>
          ))}
          <span
            className={addClientStyle}
            onMouseDown={() => {
              addingClientRef.current = true;
            }}
            onClick={() => {
              setClients([...clients, { firstName: '', lastName: '', email: '' }]);
              setClientsBlurred(false);
              addingClientRef.current = false;
            }}
            tabIndex={0}
            role="button"
            aria-label="Add client"
          >
            + Add Client
          </span>
        </Stack>
      )}
      {isMultiClient && (
        <div className={paymentInfoWrapper(showProofInfo)}>
          <div className={paymentInfoClass(showProofInfo)}>
            {(() => {
              const names = clients.map((c) => c.firstName).filter(Boolean);
              const formatList = (list: string[]) => {
                if (list.length === 1) return list[0];
                if (list.length === 2) return `${list[0]} and ${list[1]}`;
                return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
              };
              return `Request for proof of ID will be emailed to ${formatList(names)} immediately after successful delivery of the pitch email.`;
            })()}
          </div>
        </div>
      )}
      {/* Completion state indicator handled by parent container */}
    </Stack>
  );
};

export default DealCaptureForm;
