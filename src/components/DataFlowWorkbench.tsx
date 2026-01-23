import React from 'react';
import {
  Modal,
  Stack,
  Text,
  IconButton,
  mergeStyles,
  Icon
} from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

interface DataFlowWorkbenchProps {
  isOpen: boolean;
  onClose: () => void;
  embedded?: boolean;
}

const DataFlowWorkbench: React.FC<DataFlowWorkbenchProps> = ({ isOpen, onClose, embedded = false }) => {
  const { isDarkMode } = useTheme();

  const sectionStyle = mergeStyles({
    background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.8)',
    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 16,
    backdropFilter: 'blur(8px)',
  });

  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const subText = isDarkMode ? colours.dark.subText : colours.light.subText;

  const content = (
    <Stack tokens={{ childrenGap: 20 }}>
      <div className={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Icon iconName="Info" style={{ fontSize: 16, color: '#3690CE' }} />
          <Text variant="medium" style={{ fontWeight: 700, color: text }}>
            Data flow: what actually happens
          </Text>
        </div>
        <Text style={{ color: subText, lineHeight: 1.5, fontSize: 13 }}>
          The UI calls <strong>/api/*</strong>. Depending on the route and environment, requests are handled by Azure Functions and/or Express routes.
          Data lives in two Azure SQL databases (Core Data vs Instructions), and some features call external services (Clio, Microsoft Graph, Asana).
        </Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <div className={sectionStyle} style={{ borderLeft: '4px solid #3690CE' }}>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: 800, color: '#3690CE', fontSize: 13 }}>CLIENT → API</Text>
            <Text style={{ fontSize: 12, color: subText }}>
              Browser fetch calls
            </Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'React tab UI calls /api/*',
              'Auth + environment decide the backend (Functions/Express)',
              'Ops Log shows what actually fired',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3690CE' }} />
                <Text style={{ fontSize: 13, color: text }}>{t}</Text>
              </div>
            ))}
          </div>
        </div>

        <div className={sectionStyle} style={{ borderLeft: '4px solid #15803d' }}>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: 800, color: '#15803d', fontSize: 13 }}>DATA</Text>
            <Text style={{ fontSize: 12, color: subText }}>
              Two SQL sources + secrets
            </Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Core Data DB: enquiries, matters (SQL_CONNECTION_STRING)',
              'Instructions DB: Deals, Instructions (INSTRUCTIONS_SQL_CONNECTION_STRING)',
              'Secrets via Key Vault / env vars (no hardcoding)',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#15803d' }} />
                <Text style={{ fontSize: 13, color: text }}>{t}</Text>
              </div>
            ))}
          </div>
        </div>

        <div className={sectionStyle} style={{ borderLeft: '4px solid #f97316' }}>
          <div style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: 800, color: '#f97316', fontSize: 13 }}>INTEGRATIONS</Text>
            <Text style={{ fontSize: 12, color: subText }}>
              External services
            </Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Clio API for matters/contacts context',
              'Microsoft Graph for email delivery',
              'Asana for task automation (where enabled)',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
                <Text style={{ fontSize: 13, color: text }}>{t}</Text>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Icon iconName="Lightbulb" style={{ fontSize: 16, color: '#3690CE' }} />
          <Text variant="medium" style={{ fontWeight: 700, color: text }}>
            How to debug quickly
          </Text>
        </div>
        <Text style={{ color: subText, lineHeight: 1.5, fontSize: 13 }}>
          Use <strong>Operations</strong> for real request traces, <strong>Inspector</strong> for client cache and environment flags, and <strong>File Map</strong> to find the owner of a route.
        </Text>
      </div>
    </Stack>
  );

  // If embedded, render content directly without modal
  if (embedded) {
    return (
      <div style={{ padding: 0 }}>
        {content}
      </div>
    );
  }

  const modalStyles = {
    main: {
      width: '90vw',
      maxWidth: 900,
      minHeight: '70vh',
      background: `linear-gradient(135deg, ${isDarkMode ? colours.dark.background : '#FFFFFF'} 0%, ${isDarkMode ? colours.dark.background : '#F8FAFC'} 100%)`,
      borderRadius: 12,
      padding: 0,
      border: isDarkMode ? '1px solid #444' : '1px solid #ddd',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    }
  };

  const headerStyle = mergeStyles({
    background: 'transparent',
    padding: '20px 24px',
    borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  });

  const contentStyle = mergeStyles({
    padding: '24px',
    maxHeight: 'calc(70vh - 80px)',
    overflowY: 'auto'
  });

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onClose}
      styles={modalStyles}
      dragOptions={undefined}
    >
      <div className={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon iconName="Flow" style={{ fontSize: 20, color: '#3690CE' }} />
          <Text variant="xLarge" style={{ fontWeight: 600, color: '#3690CE' }}>
            Data Flow Analysis
          </Text>
        </div>
        <IconButton
          iconProps={{ iconName: 'ChromeClose' }}
          ariaLabel="Close analysis"
          onClick={onClose}
          styles={{
            root: {
              borderRadius: 6,
              width: 32,
              height: 32,
              color: isDarkMode ? '#a0aec0' : '#4a5568'
            },
            rootHovered: {
              background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
            }
          }}
        />
      </div>

      <div className={contentStyle}>
        {content}
      </div>
    </Modal>
  );
};

export default DataFlowWorkbench;
