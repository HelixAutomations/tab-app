import React from 'react';
// invisible change 2
import { useNavigatorContent } from '../app/functionality/NavigatorContext';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import '../app/styles/Navigator.css';
import '../app/styles/NavigatorPivot.css';

const Navigator: React.FC = () => {
    const { content } = useNavigatorContent();
    const { isDarkMode } = useTheme();

    if (!content) {
        return null;
    }

    return (
        <div
            className="navigator-card"
            role="region"
            aria-label="Navigator"
            style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '0',
                boxShadow: 'none',
                padding: '0',
                margin: '0',
                transition: 'all 0.15s ease',
                minHeight: 'auto',
            }}
        >
            {content}
        </div>
    );
};

export default Navigator;