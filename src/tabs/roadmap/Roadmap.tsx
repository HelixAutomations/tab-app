import React, { useState } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  Icon,
  IStackTokens,
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

interface RoadmapItem {
  label: string;
  description: string;
  status?: string;
  statusColor?: string;
}

const roadmapData: Record<string, RoadmapItem[]> = {
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
  Suggested: [
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

/**
 * STYLES
 */

// 1. Outer container holds the single vertical line at 30% from the left
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    width: '100%',
    minHeight: '100vh',
    padding: '40px 20px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    transition: 'background-color 0.3s',
    fontFamily: 'Raleway, sans-serif',
  });

// 2. The single vertical timeline line at left: '30%'
const timelineLineStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'absolute',
    left: '30%',
    top: 0,
    bottom: 0,
    width: '4px',
    background: `linear-gradient(to bottom, ${colours.blue}, ${
      isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground
    })`,
    transition: 'background-color 0.3s',
    zIndex: 1,
  });

// 3. Each item row is a flex container. We'll adjust widths so the label is on the left, dot in the middle, item box on the right.
const timelineRowStyle = mergeStyles({
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  margin: '40px 0',
});

// 4. Left column: the section label
//    Make it about 25% width so it doesn't overlap the line at 30%
const sectionLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '25%', 
    textAlign: 'right',
    paddingRight: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontWeight: 'bold',
    fontSize: '20px',
  });

// 5. The dot is at left: 'calc(30% - 10px)' so it lines up exactly with the vertical line
const markerStyle = (statusColor: string) =>
  mergeStyles({
    position: 'absolute',
    left: 'calc(30% - 16px)', 
    top: '50%',
    transform: 'translateY(-50%)',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: statusColor,
    animation: 'pulse 2s infinite',
    border: '4px solid white',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
    zIndex: 2,
  });

// 6. Right column: the item box
//    We'll give it about 65% width so it sits neatly to the right of the line
const contentBoxStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '65%', 
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'pointer',
    ':hover': {
      boxShadow: isDarkMode
        ? `0 6px 16px ${colours.dark.border}`
        : `0 6px 16px ${colours.light.border}`,
    },
  });

// A bit of margin between sections (the overall vertical stack)
const stackTokens: IStackTokens = { childrenGap: 20 };

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

  const handleSuggestSubmit = async (values: {
    [key: string]: string | number | boolean | File;
  }) => {
    console.log('Suggestion Submitted:', values);

    if (!userData || userData.length === 0) {
      setMessage({
        type: MessageBarType.error,
        text: 'User data is missing. Cannot submit suggestion.',
      });
      return;
    }

    const userInitials = userData[0]?.Initials || 'N/A';

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
        console.log('Roadmap entry created:', data);
        setMessage({
          type: MessageBarType.success,
          text: 'Your suggestion has been submitted successfully!',
        });
      } else {
        const errorText = await response.text();
        console.error('Error submitting suggestion:', errorText);
        setMessage({
          type: MessageBarType.error,
          text: 'There was an error submitting your suggestion. Please try again later.',
        });
      }
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      setMessage({
        type: MessageBarType.error,
        text: 'There was an unexpected error. Please try again later.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* The single vertical line at 30% of the container width */}
      <div className={timelineLineStyle(isDarkMode)} />

      <Stack tokens={stackTokens}>
        {Object.entries(roadmapData).map(([section, items], sectionIndex) => (
          <React.Fragment key={sectionIndex}>
            {items.map((item, itemIndex) => (
              <div key={itemIndex} className={timelineRowStyle}>
                {/* Left: The section label */}
                <Text className={sectionLabelStyle(isDarkMode)}>
                  {section}
                </Text>

                {/* The pulsing dot in the center (30% from the left) */}
                <div className={markerStyle(item.statusColor || colours.cta)} />

                {/* Right: The item box */}
                <Stack
                  className={contentBoxStyle(isDarkMode)}
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

                  <Text
                    styles={{
                      root: {
                        textAlign: 'left',
                        fontSize: '16px',
                        color: colours.blue,
                        marginTop: '10px',
                      },
                    }}
                  >
                    {item.description}
                  </Text>

                  {item.status && (
                    <Text
                      styles={{
                        root: {
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          backgroundColor: item.statusColor || colours.cta,
                          color: 'white',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          marginTop: '10px',
                          alignSelf: 'flex-end',
                        },
                      }}
                    >
                      <Icon
                        iconName={getStatusIcon(item.status)}
                        style={{ marginRight: '6px' }}
                      />
                      {item.status}
                    </Text>
                  )}
                </Stack>
              </div>
            ))}
          </React.Fragment>
        ))}

        {/* MAKE “SUGGEST AN IMPROVEMENT” LOOK LIKE AN ITEM */}
        <div className={timelineRowStyle}>
          {/* Left: Label = "Suggest an Improvement" */}
          <Text className={sectionLabelStyle(isDarkMode)}>
            Suggest an Improvement
          </Text>

          {/* Center: Pulsing dot */}
          <div className={markerStyle(colours.cta)} />

          {/* Right: The form in place of item details */}
          <Stack className={contentBoxStyle(isDarkMode)}>
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

      {/* MODAL: Show details of a selected item */}
      <Modal
        isOpen={isModalOpen}
        onDismiss={closeModal}
        isBlocking={false}
        containerClassName={mergeStyles({
          maxWidth: '600px',
          padding: '30px',
          borderRadius: '12px',
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
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
              <IconButton
                iconProps={{ iconName: 'Cancel' }}
                onClick={closeModal}
                aria-label="Close"
              />
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
