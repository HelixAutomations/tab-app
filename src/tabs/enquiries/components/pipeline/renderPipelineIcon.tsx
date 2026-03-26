/**
 * Renders a Fluent UI icon (or £ symbol) for pipeline chips.
 * Extracted from Enquiries.tsx to share across pipeline components.
 */
import React from 'react';
import { Icon } from '@fluentui/react/lib/Icon';
import { BiLogoMicrosoftTeams } from 'react-icons/bi';
import { FaExchangeAlt, FaPoundSign, FaRegCreditCard } from 'react-icons/fa';

export const renderPipelineIcon = (
  iconName: string,
  color: string,
  size: number = 14,
): React.ReactElement => {
  if (iconName === 'TeamsLogo') {
    return <BiLogoMicrosoftTeams size={size} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'PaymentCard') {
    return <FaRegCreditCard size={size - 1} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'Bank') {
    return <FaExchangeAlt size={size - 2} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  if (iconName === 'CurrencyPound') {
    return <FaPoundSign size={size - 1} color={color} style={{ display: 'block', flexShrink: 0 }} />;
  }

  return <Icon iconName={iconName === 'PitchScenario' ? 'Send' : iconName} styles={{ root: { fontSize: size, color } }} />;
};
