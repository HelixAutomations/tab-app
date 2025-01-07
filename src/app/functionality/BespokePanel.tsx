// src/app/functionality/BespokePanel.tsx

import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton, Text } from '@fluentui/react';
import { mergeStyles } from '@fluentui/react';
import '../../app/styles/bespokePanel.css'; // Ensure the path is correct

interface BespokePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string; // Optional: for dynamic width
}

const overlayStyle = mergeStyles({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'flex-end', // Align panel to the right
  zIndex: 1000,
  transition: 'opacity 0.3s ease',
});

const getPanelStyle = (width: string, closing: boolean) =>
  mergeStyles({
    backgroundColor: '#fff',
    width: width || '800px', // Default width
    maxWidth: '100%', // Responsive
    height: '100%',
    boxShadow: '-2px 0 8px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    animation: closing ? 'slideOut 0.3s forwards' : 'slideIn 0.3s forwards',
    position: 'relative',
  });

const headerStyle = mergeStyles({
  padding: '16px 24px',
  borderBottom: '1px solid #e1e1e1',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

const contentStyle = mergeStyles({
  padding: '20px',
  overflowY: 'auto',
  flexGrow: 1,
});

const BespokePanel: React.FC<BespokePanelProps> = ({ isOpen, onClose, title, children, width }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  const handleClose = () => {
    setClosing(true);
    // Wait for the animation to finish before calling onClose
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 300); // Duration should match the CSS animation duration
  };

  if (!isOpen && !closing) return null;

  return (
    <div className={overlayStyle} onClick={handleClose} aria-modal="true" role="dialog">
      <div
        className={getPanelStyle(width || '800px', closing)}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the panel
        ref={panelRef}
        tabIndex={-1} // Make div focusable
      >
        <div className={headerStyle}>
          <Text variant="large" styles={{ root: { fontWeight: 700 } }}>
            {title}
          </Text>
          <IconButton
            iconProps={{ iconName: 'Cancel' }}
            ariaLabel="Close Panel"
            onClick={handleClose}
            styles={{
              root: {
                color: '#666',
              },
              icon: {
                fontSize: 20,
              },
            }}
          />
        </div>
        <div className={contentStyle}>{children}</div>
      </div>
    </div>
  );
};

export default BespokePanel;
