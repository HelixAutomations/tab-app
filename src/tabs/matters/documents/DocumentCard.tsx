// src/tabs/matters/documents/DocumentCard.tsx

import React from 'react';
import { Text } from '@fluentui/react/lib/Text';
import { mergeStyles } from '@fluentui/react/lib/Styling';
import { Icon } from '@fluentui/react/lib/Icon';
import { IconButton } from '@fluentui/react/lib/Button';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import { DocumentEntry } from './documentIndex';
// Import the background image
import tabBg from '../../../assets/tab bg.jpg';

export interface DocumentCardProps {
  doc: DocumentEntry;
  isFavorited: boolean; // no longer used
  onSelect: (doc: DocumentEntry) => void;
  toggleFavorite: (docId: number) => void; // no longer used
}

/* 
============================================================================== 
                              Styling 
============================================================================== 
*/

// Outer card container with shadow, rounded corners, pointer cursor,
// and enforcing the app-level font.
const cardContainerStyle = mergeStyles({
  position: 'relative',
  width: '100%',
  borderRadius: 0,
  backgroundColor: '#ffffff',
  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  overflow: 'hidden',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  cursor: 'pointer',
  fontFamily: 'Raleway, sans-serif',
  selectors: {
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    },
    ':active': {
      transform: 'translateY(1px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    },
  },
});

// Top image style
const topImageStyle = mergeStyles({
  width: '100%',
  height: '120px',
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
});

// Full-width title section placed between the image and the content area
const fullWidthTitleStyle = mergeStyles({
  width: '100%',
  padding: '12px 20px',
  borderBottom: '1px solid #eee',
});

// Main content area split equally into two columns
const contentAreaStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'row',
  padding: '16px 20px',
  gap: '16px',
});

// Left column: for the description
const leftColumnStyle = mergeStyles({
  flex: 1, // 50% width
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-start',
});

// Right column: for required data and the open button
const rightColumnStyle = mergeStyles({
  flex: 1, // 50% width
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  alignItems: 'flex-start', // align required data to the left
  borderLeft: '1px solid #eee',
  paddingLeft: '16px',
});

// Optional tag style (e.g. doc type)
const tagStyle = mergeStyles({
  padding: '4px 8px',
  borderRadius: '4px',
  backgroundColor: '#eaeaea',
  color: '#555',
  fontSize: '0.75rem',
  fontWeight: 600,
  alignSelf: 'flex-start',
  marginTop: '8px',
});

// Required Data section heading (smaller font size)
const requiredDataHeadingStyle = mergeStyles({
  fontSize: '0.8rem',
  fontWeight: 600,
  marginBottom: '4px',
});

// List style for required data (smaller font size)
const requiredDataListStyle = mergeStyles({
  fontSize: '0.75rem',
  color: '#666',
  lineHeight: '1.4',
  listStyle: 'none',
  padding: 0,
});

// Completion percentage text style
const completionTextStyle = mergeStyles({
  marginTop: '8px',
  fontWeight: 600,
  color: colours.highlight,
  fontSize: '0.75rem',
});

// Open button style: white circle with subtle shadow
const openButtonStyle = mergeStyles({
  backgroundColor: '#fff',
  borderRadius: '50%',
  width: '40px',
  height: '40px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  cursor: 'pointer',
  border: 'none',
});

interface RequiredDataItem {
  field: string;
  collected: boolean;
}

const DocumentCard: React.FC<DocumentCardProps> = ({ doc, onSelect }) => {
  const { isDarkMode } = useTheme();

  // Combine card container style with dark mode background if needed.
  const finalCardStyle = mergeStyles(cardContainerStyle, {
    backgroundColor: isDarkMode ? '#2b2b2b' : '#ffffff',
  });

  // Expanded dummy required data fields for each document
  const requiredData: RequiredDataItem[] = [
    { field: 'Client Name', collected: true },
    { field: 'Case Reference', collected: false },
    { field: 'Key Details', collected: true },
    { field: 'Date of Incident', collected: false },
    { field: 'Location', collected: true },
  ];

  // Temporary fixed completion percentage (until the logic is implemented)
  const temporaryCompletionPercentage = 75;

  return (
    <div
      className={finalCardStyle}
      onClick={() => onSelect(doc)}
      role="button"
      tabIndex={0}
      aria-label={`View document: ${doc.title}`}
    >
      {/* Top image area */}
      <img
        src={tabBg}
        alt="Tab background"
        className={topImageStyle}
        style={{ objectFit: 'cover' }}
      />

      {/* Full-width title section */}
      <div className={fullWidthTitleStyle}>
        <Text
          variant="large"
          styles={{
            root: {
              fontWeight: 700,
              color: isDarkMode ? '#fff' : '#333',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
          {doc.title}
        </Text>
      </div>

      {/* Main content area split into left and right columns */}
      <div className={contentAreaStyle}>
        {/* Left Column: Description */}
        <div className={leftColumnStyle}>
          <Text
            variant="small"
            styles={{
              root: {
                color: isDarkMode ? '#d0d0d0' : '#666',
                lineHeight: '1.4',
                fontFamily: 'Raleway, sans-serif',
                whiteSpace: 'normal', // allow wrapping
                wordWrap: 'break-word',
              },
            }}
          >
            {doc.preview}
          </Text>
          {doc.type && <div className={tagStyle}>{doc.type}</div>}
        </div>

        {/* Right Column: Required data and open button */}
        <div className={rightColumnStyle}>
          <div style={{ width: '100%' }}>
            <Text styles={{ root: requiredDataHeadingStyle }}>Required Data</Text>
            <ul className={requiredDataListStyle}>
              {requiredData.map((item) => (
                <li key={item.field} style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                  <Icon
                    iconName={item.collected ? 'CheckMark' : 'Cancel'}
                    styles={{ root: { marginRight: '6px', fontSize: 14, color: item.collected ? 'green' : 'red' } }}
                  />
                  <span>{item.field}</span>
                </li>
              ))}
            </ul>
            <Text variant="small" styles={{ root: completionTextStyle }}>
              Completion: {temporaryCompletionPercentage}%
            </Text>
          </div>
          {/* Open button aligned to bottom right */}
          <IconButton
            iconProps={{ iconName: 'ChevronRight' }}
            styles={{
              root: openButtonStyle,
              icon: { fontSize: 20, color: colours.highlight },
              rootHovered: { backgroundColor: '#f3f2f1' },
              rootFocused: { outline: 'none' },
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(doc);
            }}
            aria-label="Open document"
            // Aligning the button to the bottom right of its container:
            style={{ alignSelf: 'flex-end', marginTop: '12px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentCard;
