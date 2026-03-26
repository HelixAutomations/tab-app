
// src/styles.ts
// invisible change 2

import { mergeStyles } from '@fluentui/react/lib/Styling';
export const sectionHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    color: isDarkMode ? '#D65541' : '#D65541', // Assuming highlight color is same
    fontWeight: 700, // Numeric value for consistency
    paddingBottom: '10px',
    fontFamily: 'Raleway, sans-serif',
    // Ensure no additional padding/margin
    margin: 0,
  });
