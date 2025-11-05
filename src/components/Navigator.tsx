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
                background: isDarkMode
                    ? 'linear-gradient(135deg, rgba(7, 16, 32, 1) 0%, rgba(11, 30, 55, 1) 100%)'
                    : 'linear-gradient(135deg, #F4F4F6 0%, #FAFAFA 100%)',
                backdropFilter: isDarkMode ? 'blur(16px) saturate(180%)' : 'none',
                WebkitBackdropFilter: isDarkMode ? 'blur(16px) saturate(180%)' : 'none',
                border: 'none',
                borderRadius: '0',
                boxShadow: isDarkMode
                    ? '0 2px 12px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)'
                    : 'none',
                padding: '0',
                margin: '0',
                transition: 'all 0.2s ease',
                minHeight: 'auto',
            }}
        >
            {content}
        </div>
    );
};

export default Navigator;