import React from 'react';
import { Modal } from '@fluentui/react/lib/Modal';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import { UserData, NormalizedMatter, TeamData } from '../app/functionality/types';
import FormsHub from '../tabs/forms/FormsHub';

interface FormsModalProps {
    userData: UserData[] | null;
    teamData?: TeamData[] | null;
    matters: NormalizedMatter[];
    isOpen: boolean;
    onDismiss: () => void;
}

const FormsModal: React.FC<FormsModalProps> = ({
  userData,
  teamData,
  matters,
  isOpen,
  onDismiss,
}) => {
  const { isDarkMode } = useTheme();

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      isBlocking={false}
      styles={{
        main: {
          width: 'min(1440px, calc(100vw - 48px))',
          height: 'calc(100vh - 48px)',
          maxWidth: '1440px',
          maxHeight: 'calc(100vh - 48px)',
          margin: '24px auto',
          borderRadius: 0,
          background: isDarkMode ? colours.dark.background : colours.light.background,
          border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
        },
        scrollableContent: {
          height: '100%',
        },
      }}
    >
      <FormsHub
        isOpen={isOpen}
        matters={matters}
        onDismiss={onDismiss}
        teamData={teamData}
        userData={userData}
      />
    </Modal>
  );
};

export default FormsModal;
