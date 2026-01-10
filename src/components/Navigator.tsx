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
                // Ops dashboard-aligned: glass surface, clean minimal background
                background: isDarkMode
                    ? 'rgba(15, 23, 42, 0.85)'
                    : 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: 'none',
                borderRadius: '0',
                boxShadow: isDarkMode
                    ? '0 2px 8px rgba(0, 0, 0, 0.3)'
                    : '0 2px 8px rgba(0, 0, 0, 0.05)',
                padding: '0',
                margin: '0',
                transition: 'all 0.12s ease',
                minHeight: 'auto',
            }}
        >
            {content}
        </div>
    );
};

export default Navigator;