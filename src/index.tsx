import React from 'react';
import ReactDOM from 'react-dom';
import './app/styles/index.css'; // Ensure your global styles are imported
import App from './app/App';
import { createTheme, ThemeProvider } from '@fluentui/react';
import { colours } from './app/styles/colours'; // Assuming this contains your custom colour palette

// Extend the Fluent UI theme to use Raleway
const customTheme = createTheme({
  palette: {
    themePrimary: colours.blue,
    themeDark: colours.darkBlue,
    themeLighter: colours.highlight,
    accent: colours.accent,
    neutralLight: colours.grey,
    redDark: colours.cta,
    neutralPrimary: colours.websiteBlue,
  },
  fonts: {
    small: {
      fontFamily: 'Raleway, sans-serif',
    },
    medium: {
      fontFamily: 'Raleway, sans-serif',
    },
    large: {
      fontFamily: 'Raleway, sans-serif',
    },
    xLarge: {
      fontFamily: 'Raleway, sans-serif',
    },
  },
});

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={customTheme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
