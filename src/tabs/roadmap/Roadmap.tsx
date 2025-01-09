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
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import BespokeForm from '../../CustomForms/BespokeForms';
import '../../app/styles/Roadmap.css';
import { UserData } from '../../app/functionality/types'; // Adjust the import path as needed

// Define the props interface
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
    flexDirection: 'column',
    '@media (min-width: 768px)': {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });

// Adjust the timeline container to take less width
const timelineContainerStyle = mergeStyles({
  position: 'relative',
  width: '100%',
  padding: '20px 0',
  '@media (min-width: 768px)': {
    width: '25%', // Adjust width for larger screens
  },
});

const timelineLineStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'absolute',
    left: '20px', // Increased left position for better spacing
    top: 0,
    bottom: 0,
    width: '4px',
    background: `linear-gradient(to bottom, ${colours.blue}, ${colours.light.background})`,
  });

// Adjust the marker to include horizontal spacing and correct positioning
const markerStyle = (statusColor: string) =>
  mergeStyles({
    position: 'absolute',
    top: '20px',
    left: '34px', // Positioned right of the timeline line (20px + 4px + 10px)
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: statusColor,
    animation: 'pulse 2s infinite',
    border: '4px solid white',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
  });

// Ensure content is fully to the right of the timeline and dot
const timelineItemStyle = (isDarkMode: boolean, isFirst: boolean) =>
  mergeStyles({
    position: 'relative',
    marginBottom: '40px',
    paddingLeft: '64px', // Adjusted padding to align with dot (20 + 4 + 10 + 20 + 10)
    marginTop: isFirst ? '10px' : '0', // Add top margin only to the first item
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
  color: colours.blue, // Set to blue
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

const stackTokens: IStackTokens = { childrenGap: 40 };

interface RoadmapItem {
  title: string;
  description: string;
  status?: string;
  statusColor?: string;
}

const roadmapData: { [key: string]: RoadmapItem[] } = {
  'Currently Working On': [
    {
      title: 'Pitch Email Structure/HTML Bugs',
      description: 'Resolving HTML rendering issues in pitch emails.',
      status: 'In Progress',
      statusColor: colours.blue,
    },
  ],
  'Up Next': [
    {
      title: 'Matter Overview UI + Functionality',
      description: 'Developing the user interface and functionality for Matter Overview.',
      status: 'Planned',
      statusColor: colours.orange,
    },
  ],
  'In The Pipeline': [
    {
      title: 'TBD',
      description: 'To be determined based on project priorities.',
      status: 'Planned',
      statusColor: colours.orange,
    },
  ],
  'Suggested': [
    {
      title: 'Prospect Feedback Loops',
      description: 'Implementing feedback loops for prospects.',
      status: 'Delayed',
      statusColor: colours.red,
    },
  ],
};

// Function to get status icons
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
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false); // Added state for submission

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
      alert("User data is missing. Cannot submit suggestion.");
      return;
    }

    const userInitials = userData[0]?.Initials || "N/A"; // Replace with appropriate default or handle accordingly

    const payload = {
      component: values['Component'],
      narrative: values['Narrative'],
      requested_by: userInitials,
      // submittedAt is optional and can be set in the backend if not provided
    };

    setIsSubmitting(true);

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
        alert("Your suggestion has been submitted successfully!");
        closeModal();
      } else {
        const errorText = await response.text();
        console.error("Error submitting suggestion:", errorText);
        alert("There was an error submitting your suggestion. Please try again later.");
      }
    } catch (error) {
      console.error("Error submitting suggestion:", error);
      alert("There was an unexpected error. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Display user-specific information */}
      {userData && userData.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <Text
            variant="xxLarge"
            styles={{
              root: {
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '24px',
              },
            }}
          >
            Welcome, {userData[0]?.First} {userData[0]?.Last}!
          </Text>
          {/* Add more user-specific content here if needed */}
        </div>
      )}

      <div className={timelineContainerStyle}>
        <div className={timelineLineStyle(isDarkMode)}></div>
        <Stack tokens={stackTokens}>
          {Object.entries(roadmapData).map(([section, items], sectionIndex) => (
            <div key={sectionIndex} className={mergeStyles({ marginBottom: '40px' })}>
              <Text
                variant="xxLarge"
                styles={{
                  root: {
                    marginBottom: '20px', // Reduced from 30px to 20px
                    color: isDarkMode ? colours.dark.text : colours.light.text,
                    fontSize: '24px',
                    paddingLeft: '40px', // Padding between label and items
                  },
                }}
              >
                {section}
              </Text>
              {items.map((item, index) => (
                <div key={index} className={timelineItemStyle(isDarkMode, index === 0)}>
                  <div className={markerStyle(item.statusColor || colours.cta)}></div>
                  <Stack
                    className={contentStyle(isDarkMode)}
                    onClick={() => openModal(item)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View details for ${item.title}`}
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
                        {item.title}
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
        </Stack>
      </div>
      <div
        className={mergeStyles({
          width: '100%',
          paddingLeft: '0',
          '@media (min-width: 768px)': { width: '35%', paddingLeft: '40px' },
        })}
      >
        <Text
          variant="xxLarge"
          styles={{
            root: {
              marginBottom: '20px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
              fontSize: '24px',
            },
          }}
        >
          Suggest an Improvement
        </Text>
        <BespokeForm
          fields={[
            {
              label: 'Component',
              name: 'Component', // Ensure the name matches the payload key
              type: 'dropdown',
              options: ['Home', 'Forms', 'Resources', 'Enquiries', 'Matters'],
              required: true,
            },
            {
              label: 'Narrative',
              name: 'Narrative', // Ensure the name matches the payload key
              type: 'textarea',
              required: true,
              placeholder: 'Describe your improvement suggestion...',
            },
          ]}
          onSubmit={handleSuggestSubmit}
          onCancel={closeModal}
          isSubmitting={isSubmitting} // Handle loading state in BespokeForm
        />
        {/* Removed Search Field */}
      </div>

      {/* Modal for Detailed View */}
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
              {selectedItem.title}
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
