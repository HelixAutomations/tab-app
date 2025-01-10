// src/tabs/roadmap/Roadmap.tsx

import React, { useState, useEffect, useMemo } from 'react';
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
  Spinner,
  SpinnerSize,
} from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';
import BespokeForm from '../../CustomForms/BespokeForms';
import '../../app/styles/Roadmap.css';
import { UserData } from '../../app/functionality/types';
import { format } from 'date-fns';

interface RoadmapProps {
  userData: UserData[] | null;
}

interface RoadmapEntry {
  id: number;
  requested_by: string;
  date_requested: string;
  component: string;
  label: string;
  description: string;
  status: string;
}

interface GroupedRoadmap {
  [status: string]: RoadmapEntry[];
}

// Caches
let cachedRoadmapData: RoadmapEntry[] | null = null;
let cachedRoadmapError: string | null = null;

const normalizeStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'in_progress':
    case 'in progress':
      return 'In Progress';
    case 'next':
      return 'Next';
    case 'suggested':
      return 'Suggested';
    default:
      return 'Suggested'; // Map unknown statuses to 'Suggested'
  }
};

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'in progress':
      return 'Sync';
    case 'next':
      return 'ArrowRight';
    case 'suggested':
      return 'Lightbulb';
    default:
      return 'Lightbulb';
  }
};

const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  return format(date, 'MMM d, yyyy');
};

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'relative',
    width: '100%',
    minHeight: '100vh',
    padding: '40px',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    transition: 'background-color 0.3s',
    fontFamily: 'Raleway, sans-serif',
  });

const timelineLineStyle = (isDarkMode: boolean) =>
  mergeStyles({
    position: 'absolute',
    left: '28.2%',
    transform: 'translateX(-50%)',
    top: 0,
    bottom: 0,
    width: '4px',
    background: `linear-gradient(to bottom, ${colours.blue}, ${
      isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground
    })`,
    transition: 'background-color 0.3s',
    zIndex: 1,
  });

const stackTokens: IStackTokens = { childrenGap: 20 };

const timelineRowStyle = mergeStyles({
  position: 'relative',
  marginBottom: '40px',
});

const markerStyle = (statusColor: string) =>
  mergeStyles({
    position: 'absolute',
    left: '28.2%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: statusColor,
    animation: 'pulse 2s infinite',
    border: '4px solid white',
    boxShadow: '0 0 0 2px rgba(0,0,0,0.1)',
    zIndex: 2,
  });

const contentContainerStyle = mergeStyles({
  position: 'relative',
  marginLeft: '31%',
  maxWidth: '1000px',
});

const contentBoxStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '100%',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    cursor: 'pointer',
    marginTop: '10px',
    ':hover': {
      boxShadow: isDarkMode
        ? `0 6px 16px ${colours.dark.border}`
        : `0 6px 16px ${colours.light.border}`,
    },
  });

const greyBubbleStyle = mergeStyles({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: '12px',
  backgroundColor: colours.grey,
  color: colours.greyText,
  fontSize: '14px',
  marginTop: '5px',
  marginRight: '8px',
});

const statusColorMapping: { [key: string]: string } = {
  'In Progress': colours.cta, // CTA Red
  'Next': colours.highlight, // Highlight Blue at 100% opacity
  'Suggested': colours.darkBlue, // Same as 'Other' was
};

const Roadmap: React.FC<RoadmapProps> = ({ userData }) => {
  const { isDarkMode } = useTheme();

  const [roadmapData, setRoadmapData] = useState<RoadmapEntry[] | null>(null);
  const [isLoadingRoadmap, setIsLoadingRoadmap] = useState<boolean>(true);
  const [roadmapError, setRoadmapError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<RoadmapEntry | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: MessageBarType; text: string } | null>(null);

  useEffect(() => {
    if (cachedRoadmapData || cachedRoadmapError) {
      setRoadmapData(cachedRoadmapData);
      setRoadmapError(cachedRoadmapError);
      setIsLoadingRoadmap(false);
    } else {
      const fetchRoadmap = async () => {
        try {
          setIsLoadingRoadmap(true);
          setRoadmapError(null);

          const response = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_GET_ROADMAP_PATH}?code=${process.env.REACT_APP_GET_GET_ROADMAP_CODE}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch roadmap: ${response.statusText}`);
          }

          const data = await response.json();
          if (data && Array.isArray(data.data)) {
            setRoadmapData(data.data);
            cachedRoadmapData = data.data;
          } else {
            throw new Error('Invalid data format received from roadmap API.');
          }
        } catch (error: any) {
          console.error('Error fetching roadmap:', error);
          setRoadmapError(error.message || 'Unknown error occurred while fetching roadmap.');
          cachedRoadmapError = error.message || 'Unknown error occurred while fetching roadmap.';
        } finally {
          setIsLoadingRoadmap(false);
        }
      };

      fetchRoadmap();
    }
  }, []);

  const groupedRoadmap = useMemo<GroupedRoadmap>(() => {
    const groups: GroupedRoadmap = {};
    if (roadmapData) {
      roadmapData.forEach((entry) => {
        const normStatus = normalizeStatus(entry.status);
        if (!groups[normStatus]) {
          groups[normStatus] = [];
        }
        groups[normStatus].push(entry);
      });
    }
    return groups;
  }, [roadmapData]);

  const openModal = (item: RoadmapEntry) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setIsModalOpen(false);
  };

  const handleSuggestSubmit = async (values: { [key: string]: string | number | boolean | File }) => {
    if (!userData || userData.length === 0) {
      setMessage({
        type: MessageBarType.error,
        text: 'User data is missing. Cannot submit suggestion.',
      });
      return;
    }

    const userInitials = userData[0]?.Initials || 'N/A';
    const label = typeof values['Label'] === 'string' ? values['Label'] : '';
    const component = typeof values['Component'] === 'string' ? values['Component'] : '';
    const description = typeof values['Description'] === 'string' ? values['Description'] : '';

    if (!label || !component || !description) {
      setMessage({
        type: MessageBarType.error,
        text: 'Suggestion Title/Label, Component, and Description are required.',
      });
      return;
    }

    const payload = {
      label,
      component,
      description,
      requested_by: userInitials,
    };

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_INSERT_ROADMAP_PATH}?code=${process.env.REACT_APP_GET_INSERT_ROADMAP_CODE}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setMessage({
          type: MessageBarType.success,
          text: 'Your suggestion has been submitted successfully!',
        });

        setRoadmapData((prevData) => {
          const newEntry: RoadmapEntry = {
            id: data.insertedId,
            requested_by: userInitials,
            date_requested: new Date().toISOString(),
            component: payload.component,
            label: payload.label,
            description: payload.description,
            status: 'Suggested',
          };
          const updatedData = prevData ? [...prevData, newEntry] : [newEntry];
          cachedRoadmapData = updatedData;
          return updatedData;
        });
      } else {
        const errorText = await response.text();
        console.error('Error submitting suggestion:', errorText);
        setMessage({
          type: MessageBarType.error,
          text: 'Error submitting your suggestion. Please try again later.',
        });
      }
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      setMessage({
        type: MessageBarType.error,
        text: 'Unexpected error. Please try again later.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={containerStyle(isDarkMode)}>
      <div className={timelineLineStyle(isDarkMode)} />

      <Stack tokens={stackTokens}>
        {isLoadingRoadmap ? (
          <Spinner label="Loading roadmap..." size={SpinnerSize.medium} />
        ) : roadmapError ? (
          <MessageBar messageBarType={MessageBarType.error}>{roadmapError}</MessageBar>
        ) : roadmapData && roadmapData.length > 0 ? (
          Object.entries(groupedRoadmap).map(([status, items], index) => (
            <div key={index} className={timelineRowStyle}>
              <div className={markerStyle(statusColorMapping[status] || colours.darkBlue)} />
              <div className={contentContainerStyle}>
                <Stack className={contentBoxStyle(isDarkMode)}>
                  <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
                    <Icon iconName={getStatusIcon(status)} />
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
                      {status} ({items.length})
                    </Text>
                  </Stack>

                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={mergeStyles({
                        borderTop: `1px solid ${
                          isDarkMode ? colours.dark.border : colours.light.border
                        }`,
                        paddingTop: '10px',
                        marginTop: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      })}
                      onClick={() => openModal(item)}
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${item.label}`}
                    >
                      <Text
                        styles={{
                          root: {
                            textAlign: 'left',
                            fontSize: '16px',
                            color: colours.blue,
                            flex: 1,
                          },
                        }}
                      >
                        {item.label}
                      </Text>
                      <Stack horizontal tokens={{ childrenGap: 8 }}>
                        <Text className={greyBubbleStyle}>{formatDate(item.date_requested)}</Text>
                        <Text className={greyBubbleStyle}>{item.component}</Text>
                      </Stack>
                    </div>
                  ))}
                </Stack>
              </div>
            </div>
          ))
        ) : (
          <Text>No roadmap entries available.</Text>
        )}

        <div className={timelineRowStyle}>
          <div className={markerStyle(colours.cta)} />
          <div className={contentContainerStyle}>
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
                    label: 'Suggestion Title/Label',
                    name: 'Label',
                    type: 'text',
                    required: true,
                    placeholder: 'Enter the title of your suggestion…',
                  },
                  {
                    label: 'Component',
                    name: 'Component',
                    type: 'dropdown',
                    options: ['Home', 'Forms', 'Resources', 'Enquiries', 'Matters'],
                    required: true,
                  },
                  {
                    label: 'Description',
                    name: 'Description',
                    type: 'textarea',
                    required: true,
                    placeholder: 'Describe your improvement suggestion in detail…',
                  },
                ]}
                onSubmit={handleSuggestSubmit}
                onCancel={() => {}}
                isSubmitting={isSubmitting}
                style={{ width: '100%' }}
              />
            </Stack>
          </div>
        </div>
      </Stack>

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
            <Text
              variant="medium"
              styles={{
                root: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontSize: '16px',
                },
              }}
            >
              <strong>Component:</strong> {selectedItem.component}
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
              <strong>Requested By:</strong> {selectedItem.requested_by}
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
              <strong>Date Suggested:</strong> {formatDate(selectedItem.date_requested)}
            </Text>
            <Text
              variant="small"
              styles={{
                root: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  backgroundColor:
                    statusColorMapping[normalizeStatus(selectedItem.status)] || colours.darkBlue,
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  alignSelf: 'flex-start',
                },
              }}
            >
              <Icon
                iconName={getStatusIcon(normalizeStatus(selectedItem.status))}
                style={{ marginRight: '6px' }}
              />
              {normalizeStatus(selectedItem.status)}
            </Text>
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
