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
import { UserData } from '../../app/functionality/types';
import { format } from 'date-fns';

// Define the properties for the Roadmap component
interface RoadmapProps {
  userData: UserData[] | null;
}

// Define the structure of a roadmap entry
interface RoadmapEntry {
  id: number;
  requested_by: string;
  date_requested: string;
  component: string;
  label: string;
  description: string;
  status: string;
}

// Define how roadmap entries are grouped by status
interface GroupedRoadmap {
  [status: string]: RoadmapEntry[];
}

// Caching variables to store fetched roadmap data and errors
let cachedRoadmapData: RoadmapEntry[] | null = null;
let cachedRoadmapError: string | null = null;

/**
 * Normalize status strings to standardized labels.
 * @param status - The original status string.
 * @returns Normalized status label.
 */
const normalizeStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'Recently Completed';
    case 'in_progress':
    case 'in progress':
      return 'In Progress';
    case 'next':
      return 'Next';
    case 'suggested':
      return 'Suggested';
    case 'add_suggestion':
    case 'add suggestion':
      return 'Add Suggestion';
    default:
      return 'Suggested'; // Default mapping
  }
};

/**
 * Get the appropriate icon name based on the status.
 * @param status - The normalized status label.
 * @returns Icon name as a string.
 */
const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case 'recently completed':
      return 'Completed'; // Replace with actual icon name if different
    case 'in progress':
      return 'Sync';
    case 'next':
      return 'View';
    case 'suggested':
      return 'Lightbulb';
    case 'add suggestion':
      return 'Add';
    default:
      return 'Lightbulb';
  }
};

/**
 * Format ISO date strings to a more readable format.
 * @param isoDate - The ISO date string.
 * @returns Formatted date string.
 */
const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  return format(date, 'MMM d, yyyy');
};

/**
 * Styles for the main container.
 */
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

/**
 * Styles for the timeline line.
 */
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

/**
 * Styles for each timeline row.
 */
const timelineRowStyle = mergeStyles({
  position: 'relative',
  marginBottom: '40px',
});

/**
 * Styles for the status marker.
 */
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

/**
 * Styles for the content container.
 */
const contentContainerStyle = mergeStyles({
  position: 'relative',
  marginLeft: '31%',
  maxWidth: '1000px',
});

/**
 * Styles for the content box with animations.
 */
const contentBoxStyle = (isDarkMode: boolean) =>
  mergeStyles({
    width: '100%',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s, transform 0.3s',
    cursor: 'pointer',
    marginTop: '10px',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: 'fadeInUp 0.5s ease forwards',
  });

/**
 * Styles for grey-colored bubbles (e.g., date and component).
 */
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

/**
 * Mapping of statuses to their respective colors.
 */
const statusColorMapping: { [key: string]: string } = {
  'recently completed': colours.green,
  'in progress': colours.cta,
  'next': colours.highlight,
  'suggested': colours.darkBlue,
  'add suggestion': colours.grey,
};

/**
 * Sub-component for rendering each roadmap entry item.
 */
interface RoadmapEntryItemProps {
  entry: RoadmapEntry;
  isDarkMode: boolean;
  onClick: (entry: RoadmapEntry) => void;
  animationDelay: number;
}

const RoadmapEntryItem: React.FC<RoadmapEntryItemProps> = ({ entry, isDarkMode, onClick, animationDelay }) => {
  return (
    <div
      className={mergeStyles({
        borderTop: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
        paddingTop: '10px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        opacity: 0,
        transform: 'translateY(20px)',
        animation: `fadeInUp 0.5s ease forwards`,
        animationDelay: `${animationDelay}s`,
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      })}
      onClick={() => onClick(entry)}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${entry.label}`}
    >
      <Text
        styles={{
          root: {
            textAlign: 'left',
            fontSize: '16px',
            color: colours.blue,
            flex: 1,
            fontWeight: 600,
          },
        }}
      >
        {entry.label}
      </Text>
      <Stack horizontal tokens={{ childrenGap: 8 }} verticalAlign="start">
        <Text className={greyBubbleStyle}>{formatDate(entry.date_requested)}</Text>
        <Text className={greyBubbleStyle}>{entry.component}</Text>
      </Stack>
      {/* Display description directly in the entry */}
      <Text
        styles={{
          root: {
            marginTop: '10px',
            fontSize: '14px',
            color: isDarkMode ? colours.dark.text : colours.light.text,
          },
        }}
      >
        {entry.description}
      </Text>
      {/* Display requester label */}
      <Text
        styles={{
          root: {
            marginTop: '5px',
            fontSize: '12px',
            color: colours.greyText,
            fontStyle: 'italic',
          },
        }}
      >
        Requested by: {entry.requested_by}
      </Text>
    </div>
  );
};

/**
 * Sub-component for rendering each group of roadmap entries.
 */
interface RoadmapGroupProps {
  group: {
    status: string;
    entries: RoadmapEntry[];
    animationDelay: number;
  };
  groupIndex: number;
  isDarkMode: boolean;
  onEntryClick: (entry: RoadmapEntry) => void;
}

const RoadmapGroup: React.FC<RoadmapGroupProps> = ({ group, groupIndex, isDarkMode, onEntryClick }) => {
  const isFormGroup = group.status.toLowerCase() === 'add suggestion';
  const statusColor = statusColorMapping[group.status.toLowerCase()] || colours.darkBlue;

  return (
    <div key={group.status} className={timelineRowStyle}>
      <div className={markerStyle(statusColor)} />
      <div className={contentContainerStyle}>
        <Stack
          className={mergeStyles(contentBoxStyle(isDarkMode), {
            animationDelay: `${group.animationDelay}s`,
          })}
        >
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
            <Icon iconName={getStatusIcon(group.status)} />
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
              {isFormGroup ? group.status : `${group.status} (${group.entries.length})`}
            </Text>
          </Stack>

          {!isFormGroup ? (
            // Render roadmap entries within the group
            <Stack tokens={{ childrenGap: 10 }} styles={{ root: { marginTop: '15px' } }}>
              {group.entries.map((entry, entryIndex) => (
                <RoadmapEntryItem
                  key={entry.id}
                  entry={entry}
                  isDarkMode={isDarkMode}
                  onClick={onEntryClick}
                  animationDelay={group.animationDelay + entryIndex * 0.1}
                />
              ))}
            </Stack>
          ) : (
            // Render the suggestion form within the group
            <Stack tokens={{ childrenGap: 20 }} styles={{ root: { marginTop: '15px' } }}>
              <AddSuggestionForm />
            </Stack>
          )}
        </Stack>
      </div>
    </div>
  );
};

/**
 * Sub-component for the suggestion form and its related logic.
 */
const AddSuggestionForm: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: MessageBarType; text: string } | null>(null);
  const [roadmapData, setRoadmapData] = useState<RoadmapEntry[] | null>(cachedRoadmapData);
  const { userData } = React.useContext(UserDataContext); // Assuming you have a UserDataContext

  /**
   * Handles the submission of a new suggestion.
   * @param values - The form values.
   */
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

        const newEntry: RoadmapEntry = {
          id: data.insertedId,
          requested_by: userInitials,
          date_requested: new Date().toISOString(),
          component: payload.component,
          label: payload.label,
          description: payload.description,
          status: 'Suggested',
        };

        setRoadmapData((prevData) => {
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
    <Stack tokens={{ childrenGap: 20 }}>
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
  );
};

/**
 * Context for user data. Assumes you have a UserDataContext.
 */
const UserDataContext = React.createContext<{ userData: UserData[] | null }>({ userData: null });

/**
 * Main Roadmap component.
 */
const Roadmap: React.FC<RoadmapProps> = ({ userData }) => {
  const { isDarkMode } = useTheme();

  const [roadmapData, setRoadmapData] = useState<RoadmapEntry[] | null>(null);
  const [isLoadingRoadmap, setIsLoadingRoadmap] = useState<boolean>(true);
  const [roadmapError, setRoadmapError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<RoadmapEntry | null>(null);

  /**
   * Inject keyframe animations on component mount.
   */
  useEffect(() => {
    const styles = `
      @keyframes pulse {
        0% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.2);
          opacity: 0.7;
        }
        100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
      }
      @keyframes fadeInUp {
        0% {
          opacity: 0;
          transform: translateY(20px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  /**
   * Fetch roadmap data from the API or use cached data if available.
   */
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

  /**
   * Group roadmap entries by their normalized status.
   */
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

  /**
   * Open the modal with the selected roadmap entry's details.
   * @param item - The roadmap entry to display.
   */
  const openModal = (item: RoadmapEntry) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  /**
   * Close the details modal.
   */
  const closeModal = () => {
    setSelectedItem(null);
    setIsModalOpen(false);
  };

  /**
   * Calculate animation delay for each group based on its index.
   * @param groupIndex - The index of the group.
   * @returns Animation delay in seconds.
   */
  const calculateGroupAnimationDelay = (groupIndex: number) => {
    return groupIndex * 0.3; // 300ms delay between groups
  };

  /**
   * Calculate animation delay for each entry within a group.
   * @param entryIndex - The index of the entry within the group.
   * @returns Animation delay in seconds.
   */
  const calculateEntryAnimationDelay = (entryIndex: number) => {
    return entryIndex * 0.1; // 100ms delay between entries
  };

  /**
   * Prepare the grouped roadmap entries, including the suggestion form as a separate group.
   */
  const groupedRoadmapEntries = useMemo(() => {
    const groupsArray = roadmapData ? Object.entries(groupedRoadmap) : [];
    // Append the form as a separate group
    groupsArray.push(['Add Suggestion', []]);

    const orderMapping: { [key: string]: number } = {
      'In Progress': 1,
      'Next': 2,
      'Suggested': 3,
      'Add Suggestion': 4,
      'Recently Completed': 5, // Moved to the bottom by assigning the highest order
    };

    // Sort groups based on predefined order
    groupsArray.sort((a, b) => {
      const aOrder = orderMapping[a[0]] || 100;
      const bOrder = orderMapping[b[0]] || 100;
      return aOrder - bOrder;
    });

    return groupsArray.map(([status, entries], groupIndex) => ({
      status,
      entries,
      animationDelay: calculateGroupAnimationDelay(groupIndex),
    }));
  }, [groupedRoadmap, roadmapData]);

  return (
    <UserDataContext.Provider value={{ userData }}>
      <div className={containerStyle(isDarkMode)}>
        <div className={timelineLineStyle(isDarkMode)} />

        <Stack tokens={stackTokens}>
          {isLoadingRoadmap ? (
            <Spinner label="Loading roadmap..." size={SpinnerSize.medium} />
          ) : roadmapError ? (
            <MessageBar messageBarType={MessageBarType.error}>{roadmapError}</MessageBar>
          ) : roadmapData && roadmapData.length > 0 ? (
            groupedRoadmapEntries.map((group, groupIndex) => (
              <RoadmapGroup
                key={group.status}
                group={group}
                groupIndex={groupIndex}
                isDarkMode={isDarkMode}
                onEntryClick={openModal}
              />
            ))
          ) : (
            <Text>No roadmap entries available.</Text>
          )}
        </Stack>

        {/* Modal for displaying roadmap entry details */}
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
                      statusColorMapping[normalizeStatus(selectedItem.status).toLowerCase()] || colours.darkBlue,
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
              <Stack horizontal tokens={{ childrenGap: 15 }} horizontalAlign="end">
                <PrimaryButton text="Close" onClick={closeModal} />
              </Stack>
            </Stack>
          )}
        </Modal>
      </div>
    </UserDataContext.Provider>
  );
};

export default Roadmap;
