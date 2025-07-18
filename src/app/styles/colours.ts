// invisible change 3
// src/app/styles/colours.ts

export const colours = {
  websiteBlue: '#000319',
  darkBlue: '#061733',
  blue: '#3690CE',
  highlight: '#3690CE',
  accent: '#87F3F3',
  cta: '#D65541',
  grey: '#F4F4F6',
  greyText: '#6B6B6B',
  sectionBackground: '#FFFFFF',
  inactiveTrackLight: '#CCCCCC',
  highlightYellow: '#ffefc1',
  highlightBlue: '#d6e8ff',
  highlightNeutral: '#e1e1e1',

  dark: {
    background: '#1e1e1e',
    sectionBackground: '#2d2d2d',
    text: '#ffffff',
    subText: '#3690CE',
    border: '#F4F4F6',
    footerBackground: '#2b2b2b', // Added
    cardBackground: '#2e2e2e',
    cardHover: '#3a3a3a',
    iconColor: '#ffffff',
    inputBackground: '#3a3a3a',
    previewBackground: '#333333',
    highlight: '#3690CE',
    cta: '#0078d4',
    grey: '#3a3a3a', // Added grey for dark mode

    // **Added Properties:**
    buttonBackground: '#0078d4', // Using 'cta' color for buttons in dark mode
    buttonText: '#ffffff',        // White text for buttons in dark mode
    hoverBackground: '#005a9e',    // Darker shade for hover in dark mode

    // **Newly Added Properties:**
    disabledBackground: '#3a3a3a', // Using existing 'grey' for disabled background in dark mode
    borderColor: '#6B6B6B',        // Using existing 'greyText' for border in dark mode
  },

  light: {
    background: '#f0f2f5',
    sectionBackground: '#FFFFFF',
    text: '#061733',
    subText: '#3690CE',
    border: '#F4F4F6',
    footerBackground: '#f5f5f5', // Added
    cardBackground: '#ffffff',
    cardHover: '#f9f9f9',
    iconColor: '#061733',
    inputBackground: '#F4F4F6',
    previewBackground: '#f9f9f9',
    highlight: '#3690CE',
    cta: '#0078d4',
    grey: '#F4F4F6', // Added grey for light mode

    // **Added Properties:**
    buttonBackground: '#0078d4', // Using 'cta' color for buttons in light mode
    buttonText: '#ffffff',        // White text for buttons in light mode
    hoverBackground: '#005a9e',    // Darker shade for hover in light mode

    // **Newly Added Properties:**
    disabledBackground: '#F4F4F6', // Using existing 'grey' for disabled background in light mode
    borderColor: '#6B6B6B',        // Using existing 'greyText' for border in light mode
  },

  highContrast: {
    background: '#000000', // Black background for high contrast
    sectionBackground: '#1a1a1a', // Darker grey for sections
    text: '#ffffff', // White text for contrast
    subText: '#ffff00', // Yellow for subtext
    border: '#ffffff', // White border
    cardBackground: '#1a1a1a',
    cardHover: '#333333',
    iconColor: '#ffffff', // White icons
    inputBackground: '#333333',
    previewBackground: '#1a1a1a',
    highlight: '#ffff00', // Yellow highlight
    cta: '#ff0000', // Bright red for CTA

    // **Newly Added Properties:**
    disabledBackground: '#1a1a1a', // Blackish for high contrast
    borderColor: '#ffffff',        // White border
  },

  orange: '#FF8C00', // Construction
  green: '#107c10', // Property
  yellow: '#ffd54f', // Employment
  red: '#D65541', // CTA color used as red
  tagBackground: '#e1dfdd',

  // **Newly Added Properties:**
  secondaryButtonBackground: '#F4F4F6', // Reusing existing grey color
  secondaryButtonBorder: '#6B6B6B', // Reusing existing greyText color
  secondaryButtonHoverBackground: '#D6D6D6', // Added a lighter grey for hover

  // **Reporting Colors** (Newly Added)
  reporting: {
    text: '#6B6B6B', // Grey text color
    border: '#6B6B6B', // Grey border color
    hoverRowBackground: '#d6e8ff', // Light blue for hover effects
    tableHeaderBackground: '#F4F4F6', // Table header background
    tableHeaderText: '#061733', // Table header text color
    tableEvenRowBackground: '#F4F4F6', // Even row background
    tableHoverRowBackground: '#d6e8ff', // Hover row background
  },
};
