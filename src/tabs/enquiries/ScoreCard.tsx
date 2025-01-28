// src/tabs/enquiries/ScoreCard.tsx

import React from 'react';
import { mergeStyles, Text } from '@fluentui/react';
import { colours } from '../../app/styles/colours'; // Corrected path

interface ScoreCardProps {
  initials: string;
  count: number;
  isDarkMode: boolean;
}

const cardStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    borderRadius: '8px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '150px',
  });

const ScoreCard: React.FC<ScoreCardProps> = ({ initials, count, isDarkMode }) => {
  return (
    <div className={cardStyle(isDarkMode)}>
      <Text variant="xxLarge" styles={{ root: { fontWeight: '700', color: colours.highlight } }}>
        {initials}
      </Text>
      <Text variant="large" styles={{ root: { marginTop: '10px', color: isDarkMode ? colours.dark.text : colours.light.text } }}>
        {count}
      </Text>
    </div>
  );
};

export default ScoreCard;
