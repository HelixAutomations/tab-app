import React from 'react';
import { Stack } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { colours } from '../../../app/styles/colours';

interface DealCardProps {
  initialScopeDescription: string; // renamed from serviceDescription
  amount: number | string;
  isDarkMode: boolean;
}

function formatCurrency(val: string | number) {
  const num = typeof val === 'string' ? parseFloat(val.replace(/,/g, '')) : val;
  if (isNaN(num) || num === 0) return '£0.00';
  return num.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' });
}

const DealCard: React.FC<DealCardProps> = ({
  initialScopeDescription,
  amount,
  isDarkMode,
}) => {
  const cardStyle = mergeStyles({
    background: isDarkMode
      ? colours.dark.cardBackground
      : colours.light.cardBackground,
    borderRadius: 8,
    boxShadow: isDarkMode
      ? '0 4px 12px rgba(255, 255, 255, 0.08)'
      : '0 4px 12px rgba(0, 0, 0, 0.08)',
    padding: '18px 20px',
    minWidth: 220,
    minHeight: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  });

  const labelStyle = mergeStyles({
    fontSize: 13,
    fontWeight: 600,
    color: isDarkMode ? colours.dark.text : colours.darkBlue,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  });

  const valueStyle = mergeStyles({
    fontSize: 16,
    fontWeight: 500,
    color: isDarkMode ? colours.light.text : colours.dark.text,
    marginBottom: 6,
  });

  return (
    <Stack className={cardStyle} tokens={{ childrenGap: 10 }}>
      <div>
        <div className={labelStyle}>Initial Scope & Charging</div>
        <div className={valueStyle}>{initialScopeDescription || <span style={{ color: colours.greyText }}>Not specified</span>}</div>
      </div>
      <div>
        <div className={labelStyle}>Amount (inc. VAT)</div>
        <div className={valueStyle}>{formatCurrency(typeof amount === 'string' ? Number(amount.replace(/,/g, '')) * 1.2 : Number(amount) * 1.2)}</div>
      </div>
      <div>
        <div className={labelStyle}>Validity</div>
        <div className={valueStyle}>7 days</div>
      </div>
    </Stack>
  );
};

export default DealCard;
