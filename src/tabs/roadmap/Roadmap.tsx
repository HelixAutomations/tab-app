// src/tabs/roadmap/Roadmap.tsx

import React, { useState } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  Icon,
  IStackTokens,
  TooltipHost,
  Modal,
  PrimaryButton,
  IconButton,
  MessageBar,
  MessageBarType,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import BespokeForm from '../../CustomForms/BespokeForms';
import '../../app/styles/Roadmap.css';
import { UserData } from '../../app/functionality/types'; // Adjust the import path as needed

interface RoadmapProps {
  userData: UserData[] | null;
}

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '40px 20px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    minHeight: '100vh',
    transition: 'background-color 0.3s',
    fontFamily: 'Raleway, sans-serif',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    '@media (min-width: 768px)': {
      justifyContent: 'center',
    },
  });

const timelineContainerStyle = mergeStyles({
  position: 'relative',
  width: '100%',
  maxWidth: '600px',
  padding: '20px 0',
});

const timelineLineStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'absolute',
    left: '20px',
    top: 0,
    bottom: 0,
    width: '4px',
    background: `linear-gradient(to bottom, ${colours.blue}, ${colours.light.background})`,
  });

// Updated markerStyle to add padding on the right side
const markerStyle = (statusColor: string) =>
  mergeStyles({
    position: 'absolute',
    top: '20px',
    left: '35px', // Increased left to add more space on the right
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: statusColor,
    animation: 'pulse 2s infinite',
    border: '4px solid white',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
    transform: 'translate(-50%, -50%)',
  });

const timelineItemStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    marginBottom: '20px', // Reduced marginBottom to bring items closer
    paddingLeft: '70px', // Increased paddingLeft to accommodate the added right padding
    width: '100%',
    display: 'flex',
    justifyContent: 'flex-start',
  });

const contentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    fontSize: '20px',
    cursor: 'pointer',
    width: '100%',
    ':hover': {
      boxShadow: isDarkMode
        ? `0 6px 16px ${colours.dark.border}`
        : `0 6px 16px ${colours.light.border}`,
    },
  });

const descriptionStyle = mergeStyles({
  textAlign: 'left',
  fontSize: '16px',
  color: colours.blue,
  marginTop: '10px',
});

const statusStyle = (isDarkMode: boolean, statusColor: string) =>
  mergeStyles({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 12px',
    borderRadius: '12px',
    backgroundColor: statusColor,
    color: 'white',
    fontWeight: 'bold',
    fontSize: '14px',
    marginTop: '10px',
    alignSelf: 'flex-end',
  });

const stackTokens: IStackTokens = { childrenGap: 20 }; // Reduced childrenGap for closer items

interface RoadmapItem {
  label: string;
  description: string;
  status?: string;
  statusColor?: string;
}

const roadmapData: { [key: string]: RoadmapItem[] } = {
  'Currently Working On': [
    {
      label: 'Pitch Email Structure/HTML Bugs',
      description: 'Resolving HTML rendering issues in pitch emails.',
      status: 'In Progress',
      statusColor: colours.blue,
    },
  ],
  'Up Next': [
    {
      label: 'Matter Overview UI + Functionality',
      description: 'Developing the user interface and functionality for Matter Overview.',
      status: 'Planned',
      statusColor: colours.orange,
    },
  ],
  'In The Pipeline': [
    {
      label: 'TBD',
      description: 'To be determined based on project priorities.',
      status: 'Planned',
      statusColor: colours.orange,
    },
  ],
  'Suggested': [
    {
      label: 'Prospect Feedback Loops',
      description: 'Implementing feedback loops for prospects.',
      status: 'Delayed',
      statusColor: colours.red,
    },
  ],
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'In Progress':
      return 'Sync';
    case 'Planned':
      return 'Calendar';
    case 'Delayed':
      return 'Warning';
    default:
      return 'Info';
  }
};

const Roadmap: React.FC<RoadmapProps> = ({ userData }) => {
  const { isDarkMode } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: MessageBarType; text: string } | null>(null);

  const openModal = (item: RoadmapItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setIsModalOpen(false);
  };

  const handleSuggestSubmit = async (values: { [key: string]: string | number | boolean | File }) => {
    console.log('Suggestion Submitted:', values);

    if (!userData || userData.length === 0) {
      setMessage({ type: MessageBarType.error, text: "User data is missing. Cannot submit suggestion." });
      return;
    }

    const userInitials = userData[0]?.Initials || "N/A";

    const payload = {
      component: values['Component'],
      label: values['Label'],
      description: values['Description'],
      requested_by: userInitials,
    };

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_INSERT_ROADMAP_PATH}?code=${process.env.REACT_APP_GET_INSERT_ROADMAP_CODE}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Roadmap entry created:", data);
        setMessage({ type: MessageBarType.success, text: "Your suggestion has been submitted successfully!" });
      } else {
        const errorText = await response.text();
        console.error("Error submitting suggestion:", errorText);
        setMessage({ type: MessageBarType.error, text: "There was an error submitting your suggestion. Please try again later." });
      }
    } catch (error) {
      console.error("Error submitting suggestion:", error);
      setMessage({ type: MessageBarType.error, text: "There was an unexpected error. Please try again later." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={timelineContainerStyle}>
        <div className={timelineLineStyle(isDarkMode)}></div>
        <Stack tokens={stackTokens}>
          {Object.entries(roadmapData).map(([section, items], sectionIndex) => (
            <div key={sectionIndex} className={mergeStyles({ marginBottom: '20px' })}> {/* Reduced marginBottom between sections */}
              <Text
                variant="xxLarge"
                styles={{
                  root: {
                    paddingBottom: '20px', // Added marginBottom for spacing below the label
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontSize: '24px',
                    textAlign: 'left',
                    paddingLeft: '70px',
                  },
                }}
              >
                {section}
              </Text>
              {items.map((item, index) => (
                <div key={index} className={timelineItemStyle(isDarkMode)}>
                  <div className={markerStyle(item.statusColor || colours.cta)}></div>
                  <Stack
                    className={contentStyle(isDarkMode)}
                    onClick={() => openModal(item)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View details for ${item.label}`}
                  >
                    <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                      <Icon iconName={getStatusIcon(item.status || '')} />
                      <Text
                        variant="large"
                        styles={{
                          root: {
                            fontWeight: '700',
                            color: isDarkMode ? colours.dark.text : colours.light.text,
                            fontSize: '20px',
                          },
                        }}
                      >
                        {item.label}
                      </Text>
                    </Stack>
                    <Text className={descriptionStyle}>{item.description}</Text>
                    {item.status && (
                      <Text className={statusStyle(isDarkMode, item.statusColor || colours.cta)}>
                        <Icon iconName={getStatusIcon(item.status)} style={{ marginRight: '6px' }} />
                        {item.status}
                      </Text>
                    )}
                  </Stack>
                </div>
              ))}
            </div>
          ))}
          <div className={timelineItemStyle(isDarkMode)}>
            <div className={markerStyle(colours.cta)}></div>
            <Stack className={contentStyle(isDarkMode)}>
              <Text
                variant="large"
                styles={{
                  root: {
                    fontWeight: '700',
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontSize: '20px',
                    marginBottom: '10px',
                  },
                }}
              >
                Suggest an Improvement
              </Text>
              {message && (
                <MessageBar
                  messageBarType={message.type}
                  isMultiline={false}
                  onDismiss={() => setMessage(null)}
                  dismissButtonAriaLabel="Close"
                  styles={{ root: { marginBottom: '20px' } }}
                >
                  {message.text}
                </MessageBar>
              )}
              <BespokeForm
                fields={[
                  {
                    label: 'Component',
                    name: 'Component',
                    type: 'dropdown',
                    options: ['Home', 'Forms', 'Resources', 'Enquiries', 'Matters'],
                    required: true,
                  },
                  {
                    label: 'Label',
                    name: 'Label',
                    type: 'text',
                    required: true,
                    placeholder: 'Enter a short title for your improvement...',
                  },
                  {
                    label: 'Description',
                    name: 'Description',
                    type: 'textarea',
                    required: true,
                    placeholder: 'Describe your improvement suggestion in detail...',
                  },
                ]}
                onSubmit={handleSuggestSubmit}
                onCancel={() => {}}
                isSubmitting={isSubmitting}
                style={{ width: '100%' }}
              />
            </Stack>
          </div>
        </Stack>
      </div>

      <Modal
        isOpen={isModalOpen}
        onDismiss={closeModal}
        isBlocking={false}
        containerClassName={mergeStyles({
          maxWidth: '600px',
          padding: '30px',
          borderRadius: '12px',
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          fontFamily: 'Raleway, sans-serif',
        })}
        styles={{
          main: {
            maxWidth: '600px',
            margin: 'auto',
          },
        }}
        aria-labelledby="roadmap-item-details"
      >
        {selectedItem && (
          <Stack tokens={{ childrenGap: 20 }}>
            <Stack horizontalAlign="end">
              <IconButton iconProps={{ iconName: 'Cancel' }} onClick={closeModal} aria-label="Close" />
            </Stack>
            <Text
              variant="xxLarge"
              styles={{
                root: {
                  fontWeight: '700',
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '24px',
                },
              }}
            >
              {selectedItem.label}
            </Text>
            <Text
              variant="medium"
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '16px',
                },
              }}
            >
              {selectedItem.description}
            </Text>
            {selectedItem.status && (
              <Text
                variant="small"
                styles={{
                  root: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 8px',
                    borderRadius: '12px',
                    backgroundColor: selectedItem.statusColor || colours.cta,
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    alignSelf: 'flex-end',
                  },
                }}
              >
                <Icon iconName={getStatusIcon(selectedItem.status)} style={{ marginRight: '6px' }} />
                Status: {selectedItem.status}
              </Text>
            )}
            <Stack horizontal tokens={{ childrenGap: 10 }} horizontalAlign="end">
              <PrimaryButton text="Close" onClick={closeModal} />
            </Stack>
          </Stack>
        )}
      </Modal>
    </div>
  );
};

export default Roadmap;
