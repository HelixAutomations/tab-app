// src/components/Loading.tsx

import React from 'react';
import { mergeStyles } from '@fluentui/react';
import loaderIcon from '../../assets/dark blue mark.svg'; // Updated logo

// Define keyframes for the fade-in and scale-up animation
const fadeInScaleUpAnimation = `
@keyframes fadeInScaleUp {
  0% {
    opacity: 0;
    transform: scale(1); /* Start smaller */
  }
  100% {
    opacity: 1;
    transform: scale(0.75); /* End at full size */
  }
}
`;

// Styles for the loading container
const loadingContainerStyle = mergeStyles({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '80vh', // Adjust as needed
});

// Styles for the logo with fade-in and scale-up animation
const logoStyle = mergeStyles({
  width: '450px', // Logo size
  height: '450px',
  animationName: 'fadeInScaleUp',
  animationDuration: '1.5s', // Slightly longer for smoothness
  animationTimingFunction: 'ease-out',
  animationFillMode: 'forwards',
});

// Inject the keyframes into the document
const GlobalStyles: React.FC = () => (
  <style>
    {fadeInScaleUpAnimation}
  </style>
);

const Loading: React.FC = () => (
  <div className={loadingContainerStyle}>
    <GlobalStyles />
    <img src={loaderIcon} alt="Loading..." className={logoStyle} />
  </div>
);

export default Loading;
