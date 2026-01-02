// src/tabs/forms/FormsSimple.tsx
// Simplified Apple/Microsoft-style forms view
// Clean grid of icons - click to open form directly

import React, { useState, useCallback, useMemo } from 'react';
import {
  Stack,
  Text,
  SearchBox,
  Icon,
  mergeStyles,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import { formSections } from './formsData';
import { FormItem, UserData, NormalizedMatter } from '../../app/functionality/types';
import FormEmbed from '../../components/FormEmbed';

interface FormsSimpleProps {
  userData: UserData[] | null;
  matters: NormalizedMatter[];
}

// All forms flattened with category info
const getAllForms = () => {
  const all: (FormItem & { category: string })[] = [];
  
  const categoryLabels: Record<string, string> = {
    General_Processes: 'General',
    Operations: 'Operations',
    Financial: 'Financial',
    Tech_Support: 'Tech',
    Directories: 'Directories',
  };

  Object.entries(formSections).forEach(([category, forms]) => {
    forms.forEach(form => {
      all.push({ ...form, category: categoryLabels[category] || category });
    });
  });

  return all;
};

// Styles
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    minHeight: '100vh',
    width: '100%',
    padding: '32px 40px',
    background: isDarkMode 
      ? '#0a0a0a'
      : '#fafafa',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });

const headerStyle = mergeStyles({
  marginBottom: '32px',
});

const gridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: '24px',
  maxWidth: '1000px',
});

const formItemStyle = (isDarkMode: boolean, isHovered: boolean) =>
  mergeStyles({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 12px',
    borderRadius: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: isHovered 
      ? (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)')
      : 'transparent',
    transform: isHovered ? 'scale(1.02)' : 'scale(1)',
  });

const iconContainerStyle = (isDarkMode: boolean, color: string) =>
  mergeStyles({
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
    background: `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`,
    border: `1px solid ${color}30`,
    boxShadow: `0 4px 12px ${color}15`,
  });

const titleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '13px',
    fontWeight: 500,
    color: isDarkMode ? '#e0e0e0' : '#333',
    textAlign: 'center',
    lineHeight: '1.3',
    maxWidth: '120px',
  });

const categoryBadgeStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontSize: '10px',
    fontWeight: 500,
    color: isDarkMode ? '#888' : '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: '4px',
  });

// Back button panel style
const panelContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: isDarkMode ? '#0a0a0a' : '#fafafa',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  });

const panelHeaderStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    padding: '16px 24px',
    borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
    background: isDarkMode ? '#111' : '#fff',
    gap: '16px',
    flexShrink: 0,
  });

const panelContentStyle = mergeStyles({
  flex: 1,
  overflow: 'auto',
  padding: '24px',
});

const backButtonStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    color: isDarkMode ? '#fff' : '#333',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.15s ease',
    selectors: {
      ':hover': {
        background: isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
      },
    },
  });

// Color mapping for icons
const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    General: '#0078d4',      // Blue
    Operations: '#107c10',    // Green
    Financial: '#8764b8',     // Purple
    Tech: colours.highlight,  // Brand blue
    Directories: '#00b7c3',   // Teal
  };
  return colors[category] || colours.highlight;
};

// Form item component
const FormGridItem: React.FC<{
  form: FormItem & { category: string };
  isDarkMode: boolean;
  onClick: () => void;
}> = ({ form, isDarkMode, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const color = getCategoryColor(form.category);

  return (
    <div
      className={formItemStyle(isDarkMode, isHovered)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className={iconContainerStyle(isDarkMode, color)}>
        <Icon 
          iconName={form.icon || 'Document'} 
          style={{ fontSize: 28, color }} 
        />
      </div>
      <span className={titleStyle(isDarkMode)}>{form.title}</span>
      <span className={categoryBadgeStyle(isDarkMode)}>{form.category}</span>
    </div>
  );
};

const FormsSimple: React.FC<FormsSimpleProps> = ({ userData, matters }) => {
  const { isDarkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedForm, setSelectedForm] = useState<(FormItem & { category: string }) | null>(null);

  const allForms = useMemo(() => getAllForms(), []);

  const filteredForms = useMemo(() => {
    if (!searchQuery.trim()) return allForms;
    const query = searchQuery.toLowerCase();
    return allForms.filter(form => 
      form.title.toLowerCase().includes(query) ||
      form.category.toLowerCase().includes(query) ||
      form.description?.toLowerCase().includes(query)
    );
  }, [allForms, searchQuery]);

  const handleFormClick = useCallback((form: FormItem & { category: string }) => {
    setSelectedForm(form);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedForm(null);
  }, []);

  // Get current user from userData
  const currentUser = useMemo(() => {
    if (!userData || userData.length === 0) return undefined;
    // Try to find current user - typically first one or match by email
    return userData[0];
  }, [userData]);

  // If a form is selected, show full-screen form view
  if (selectedForm) {
    // Check if it's a custom component form
    if (selectedForm.component) {
      const FormComponent = selectedForm.component;
      return (
        <div className={panelContainerStyle(isDarkMode)}>
          <FormComponent
            userData={userData || undefined}
            currentUser={currentUser}
            matters={matters}
            onBack={handleBack}
          />
        </div>
      );
    }

    // External or embedded form
    return (
      <div className={panelContainerStyle(isDarkMode)}>
        <div className={panelHeaderStyle(isDarkMode)}>
          <button className={backButtonStyle(isDarkMode)} onClick={handleBack}>
            <Icon iconName="ChevronLeft" style={{ fontSize: 16 }} />
            Back
          </button>
          <Text style={{ 
            fontSize: '18px', 
            fontWeight: 600, 
            color: isDarkMode ? '#fff' : '#333' 
          }}>
            {selectedForm.title}
          </Text>
        </div>
        <div className={panelContentStyle}>
          <FormEmbed
            link={selectedForm}
            userData={userData}
            matters={matters}
          />
        </div>
      </div>
    );
  }

  // Main grid view
  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={headerStyle}>
        <Text
          style={{
            fontSize: '32px',
            fontWeight: 700,
            color: isDarkMode ? '#fff' : '#111',
            letterSpacing: '-0.02em',
            marginBottom: '8px',
            display: 'block',
          }}
        >
          Forms
        </Text>
        <Text
          style={{
            fontSize: '15px',
            color: isDarkMode ? '#888' : '#666',
            marginBottom: '24px',
            display: 'block',
          }}
        >
          {filteredForms.length} forms available
        </Text>
        
        <SearchBox
          placeholder="Search forms..."
          value={searchQuery}
          onChange={(_, val) => setSearchQuery(val || '')}
          styles={{
            root: {
              maxWidth: '400px',
              borderRadius: '12px',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'}`,
              background: isDarkMode ? 'rgba(255,255,255,0.05)' : '#fff',
              overflow: 'hidden',
            },
            field: {
              background: 'transparent',
              padding: '12px 16px',
              fontSize: '15px',
              color: isDarkMode ? '#fff' : '#333',
            },
            icon: {
              color: isDarkMode ? '#888' : '#666',
            },
          }}
        />
      </div>

      <div className={gridStyle}>
        {filteredForms.map((form) => (
          <FormGridItem
            key={form.title}
            form={form}
            isDarkMode={isDarkMode}
            onClick={() => handleFormClick(form)}
          />
        ))}
      </div>

      {filteredForms.length === 0 && (
        <Stack horizontalAlign="center" style={{ padding: '60px 20px' }}>
          <Icon 
            iconName="SearchIssue" 
            style={{ fontSize: 48, color: isDarkMode ? '#555' : '#ccc', marginBottom: 16 }} 
          />
          <Text style={{ color: isDarkMode ? '#888' : '#666', fontSize: '16px' }}>
            No forms found for "{searchQuery}"
          </Text>
        </Stack>
      )}
    </div>
  );
};

export default FormsSimple;
