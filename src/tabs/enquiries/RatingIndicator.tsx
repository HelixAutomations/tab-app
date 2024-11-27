// src/RatingIndicator.tsx

import React from 'react';
import { IconButton, IIconProps, IButtonStyles } from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface RatingIndicatorProps {
  rating?: string; // Optional to handle unrated state
  onClick: () => void;
}

// Function to determine icon details based on rating
const getIconDetails = (rating?: string): IIconProps => {
  if (!rating) {
    return { iconName: 'Like' }; // Default icon for unrated
  }

  switch (rating) {
    case 'Good':
      return { iconName: 'LikeSolid' };
    case 'Neutral':
      return { iconName: 'LikeSolid' }; // Use the filled icon
    case 'Poor':
      return { iconName: 'DislikeSolid' };
    default:
      return { iconName: 'Like' };
  }
};

// Function to determine icon color based on rating
const getIconColor = (rating?: string): string => {
  if (!rating) {
    return colours.cta; // Default color for unrated
  }

  switch (rating) {
    case 'Good':
      return colours.blue;
    case 'Neutral':
      return colours.grey; // Set the color to grey
    case 'Poor':
      return colours.cta;
    default:
      return colours.grey;
  }
};

// Define a shared style object for IconButton
const ratingButtonStyles = (iconColor: string): IButtonStyles => ({
  root: {
    marginBottom: '8px',
    color: iconColor,
    backgroundColor: 'transparent',
    border: 'none',
    selectors: {
      ':hover': {
        backgroundColor: colours.cta,
        color: '#ffffff',
      },
      ':focus': {
        backgroundColor: 'transparent', // Keep background transparent
        color: iconColor, // Keep icon color the same
        outline: 'none', // Remove focus outline
      },
    },
    height: '20px',
    width: '20px',
    padding: '0px',
    boxShadow: 'none',
  },
  icon: {
    fontSize: '16px',
    lineHeight: '20px',
    color: iconColor,
  },
});

const RatingIndicator: React.FC<RatingIndicatorProps> = ({ rating, onClick }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const iconProps = getIconDetails(rating);
  const iconColor = getIconColor(rating);

  const customStyles: IButtonStyles = ratingButtonStyles(iconColor);

  return (
    <IconButton
      iconProps={iconProps}
      title={rating ? `Rating: ${rating}` : 'Rate Enquiry'}
      ariaLabel={rating ? `Rating: ${rating}` : 'Rate Enquiry'}
      onClick={(e) => {
        e.stopPropagation(); // Prevent event from bubbling up
        onClick();
      }}
      styles={customStyles}
    />
  );
};

export default RatingIndicator;
