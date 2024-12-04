// src/tabs/home/Home.tsx

import React, { useState, useEffect, useContext, useMemo } from 'react';
import {
  mergeStyles,
  Text,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
  IconButton,
  TooltipHost,
  Stack,
  DetailsList,
  IColumn,
  DetailsListLayoutMode,
  Panel,
  PanelType,
  Persona,
  PersonaSize,
  PersonaPresence,
} from '@fluentui/react';
import { TeamsContext } from '../../app/functionality/TeamsContext';
import { useFeContext } from '../../app/functionality/FeContext';
import { colours } from '../../app/styles/colours';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import QuickActionsCard from './QuickActionsCard';
import MetricCard from './MetricCard';
import GreyHelixMark from '../../assets/grey helix mark.png';
import HelixAvatar from '../../assets/helix avatar.png';
import * as microsoftTeams from '@microsoft/teams-js';
import '../../app/styles/VerticalLabelPanel.css';

import { useTheme } from '../../app/functionality/ThemeContext';

import '../../app/styles/MetricCard.css'; // Ensure CSS is imported

// Import updated form components
import Tasking from '../../CustomForms/Tasking';
import TelephoneAttendance from '../../CustomForms/TelephoneAttendance';
import RetrieveContactForm from '../../CustomForms/RetrieveContactForm';
import CreateTimeEntryForm from '../../CustomForms/CreateTimeEntryForm';

// Import FormCard and ResourceCard
import FormCard from '../forms/FormCard'; // Adjust path as needed
import ResourceCard from '../resources/ResourceCard'; // Adjust path as needed

// Import FormItem and Resource types
import { FormItem } from '../forms/Forms'; // Ensure FormItem is exported from Forms.tsx
import { Resource } from '../resources/Resources'; // Ensure Resource is exported from Resources.tsx

// Import Detail Components
import FormDetails from '../forms/FormDetails'; // Ensure this component exists
import ResourceDetails from '../resources/ResourceDetails'; // Ensure this component exists

interface HomeProps {
  context: microsoftTeams.Context | null;
}

initializeIcons();

interface QuickLink {
  title: string;
  icon: string;
}

interface Person {
  name: string;
  initials: string;
  presence: PersonaPresence;
}

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    padding: '20px', // General padding
    minHeight: '100vh',
    boxSizing: 'border-box',
  });

const headerStyle = mergeStyles({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: '10px 0px', // Reduced top padding
});

const greetingStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '32px',
    whiteSpace: 'nowrap',
    color: isDarkMode ? colours.dark.text : colours.light.text, // Responsive text color
  });

const mainContentStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
});

const sectionRowStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  gap: '20px',
  width: '100%',
});

const sectionLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const quickLinksStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px',
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    flex: '1',
    display: 'flex',
    flexDirection: 'column',
  });

const calculateAnimationDelay = (rowIndex: number, colIndex: number) => {
  return rowIndex * 0.2 + colIndex * 0.1; // Adjust timing as needed
};

// Updated Metrics Container Style to include grid layout
const metricsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'grid',
    gridTemplateColumns: '60px 1fr 1fr 1fr', // Side label + 3 metric columns
    gridTemplateRows: 'auto repeat(3, 1fr)', // Top labels + 3 metric rows
    gap: '20px', // Consistent gap
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    backgroundImage: `url(${GreyHelixMark})`,
    backgroundPosition: 'top right',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'auto 100%',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    flex: '1',
    position: 'relative', // Ensure positioning context
    overflow: 'visible', // Allow elements to overflow if needed
  });

// New Top Labels Style
const metricsTopLabelsStyle = (isDarkMode: boolean) =>
  mergeStyles({
    gridColumn: '2 / span 3',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  });

// Updated Sidebar Labels Style with Animation
const metricsSidebarLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '16px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    textAlign: 'center',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '10px 20px',
    borderTopRightRadius: '12px',
    borderBottomRightRadius: '12px',
    writingMode: 'vertical-rl',
    textOrientation: 'mixed',
    transform: 'rotate(180deg)',
    boxShadow: isDarkMode
      ? `2px 0 4px ${colours.dark.border}`
      : `2px 0 4px ${colours.light.border}`,
    marginRight: '-20px',
    paddingRight: '30px',
    zIndex: 1,
  });

const cardTitleStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '400',
    fontSize: '24px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const versionStyle = mergeStyles({
  textAlign: 'center',
  fontSize: '14px',
  color: '#888',
  marginTop: '40px', // Increased margin top for spacing
});

const subLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const favouritesGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', // Increased minWidth to 300px
  gap: '20px', // Space between cards
  '@media (min-width: 1000px)': {
    gridTemplateColumns: 'repeat(5, 1fr)', // Consistent with other grids
  },
});

const createColumnsFunction = (isDarkMode: boolean): IColumn[] => [
  {
    key: 'key',
    name: 'Key',
    fieldName: 'key',
    minWidth: 150,
    maxWidth: 200,
    isResizable: true,
    styles: {
      root: { color: isDarkMode ? colours.dark.text : colours.light.text },
    },
  },
  {
    key: 'value',
    name: 'Value',
    fieldName: 'value',
    minWidth: 300,
    maxWidth: 600,
    isResizable: true,
    styles: {
      root: { color: isDarkMode ? colours.dark.text : colours.light.text },
    },
  },
];

// Define 'quickActions' array
const quickActions: QuickLink[] = [
  { title: 'Create a Task', icon: 'Add' },
  { title: 'Create a Time Entry', icon: 'Clock' },
  { title: 'Record an Attendance Note', icon: 'Add' },
  { title: 'Retrieve a Contact', icon: 'Contact' },
];

// Define 'inOfficePeople' array
const inOfficePeople: Person[] = [
  { name: 'Alex Cook', initials: 'AC', presence: PersonaPresence.online },
  { name: 'Jonathan Waters', initials: 'JW', presence: PersonaPresence.away },
  { name: 'Lukasz Zemanek', initials: 'LZ', presence: PersonaPresence.busy },
  { name: 'Laura Albon', initials: 'LA', presence: PersonaPresence.online },
];

// Define 'onLeavePeople' array
const onLeavePeople: Person[] = [
  { name: 'Sam Packwood', initials: 'SP', presence: PersonaPresence.away },
  { name: 'Richard Chapman', initials: 'RC', presence: PersonaPresence.offline },
  { name: 'Kanchel White', initials: 'KW', presence: PersonaPresence.away },
];

// Define 'subSectionContainerStyle' style
const subSectionContainerStyle = mergeStyles({
  marginTop: '0', // Adds spacing above the sub-section
  marginBottom: '0', // Adds spacing below the sub-section
});

// Define 'officeLeaveContainerStyle' style
const officeLeaveContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px',
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    flex: '1 1 50%', // Ensure equal width
    display: 'flex',
    flexDirection: 'column',
  });

// Define 'transformContext' function
const transformContext = (contextObj: any): { key: string; value: string }[] => {
  if (!contextObj || typeof contextObj !== 'object') {
    console.warn('Invalid context object:', contextObj);
    return [];
  }

  return Object.entries(contextObj).map(([key, value]) => ({
    key,
    value: String(value),
  }));
};

const Home: React.FC<HomeProps> = ({ context }) => {
  const { isDarkMode } = useTheme(); // Access isDarkMode from Theme Context
  const { context: teamsContext } = useContext(TeamsContext);
  const { sqlData, isLoading: isSqlLoading, error, fetchEnquiries, enquiries } = useFeContext();
  const [greeting, setGreeting] = useState<string>('');
  const [typedGreeting, setTypedGreeting] = useState<string>(''); // New state for typed greeting
  const [enquiriesToday, setEnquiriesToday] = useState<number>(0);
  const [enquiriesWeekToDate, setEnquiriesWeekToDate] = useState<number>(0);
  const [enquiriesMonthToDate, setEnquiriesMonthToDate] = useState<number>(0);

  const [todaysTasks, setTodaysTasks] = useState<number>(10);
  const [tasksDueThisWeek, setTasksDueThisWeek] = useState<number>(20);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(15);

  const [recordedTime, setRecordedTime] = useState<{ hours: number; money: number }>({ hours: 120, money: 1000 });

  // Previous period state variables (dummy data)
  const [prevEnquiriesToday, setPrevEnquiriesToday] = useState<number>(8);
  const [prevEnquiriesWeekToDate, setPrevEnquiriesWeekToDate] = useState<number>(18);
  const [prevEnquiriesMonthToDate, setPrevEnquiriesMonthToDate] = useState<number>(950);

  const [prevTodaysTasks, setPrevTodaysTasks] = useState<number>(12);
  const [prevTasksDueThisWeek, setPrevTasksDueThisWeek] = useState<number>(18);
  const [prevCompletedThisWeek, setPrevCompletedThisWeek] = useState<number>(17);

  const [prevRecordedTime, setPrevRecordedTime] = useState<{ hours: number; money: number }>({ hours: 110, money: 900 });

  const [isValidatingUser, setIsValidatingUser] = useState<boolean>(true);
  const [isExtractingData, setIsExtractingData] = useState<boolean>(true);
  const [isProcessingEnquiries, setIsProcessingEnquiries] = useState<boolean>(true);

  const [isContextsExpanded, setIsContextsExpanded] = useState<boolean>(false);

  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<QuickLink | null>(null);

  // New states for favourites
  const [formsFavorites, setFormsFavorites] = useState<FormItem[]>([]);
  const [resourcesFavorites, setResourcesFavorites] = useState<Resource[]>([]);

  // States for selected favourites (for details panels)
  const [selectedForm, setSelectedForm] = useState<FormItem | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);

  // Fetch favourites from localStorage on mount
  useEffect(() => {
    const storedFormsFavorites = localStorage.getItem('formsFavorites');
    const storedResourcesFavorites = localStorage.getItem('resourcesFavorites');

    if (storedFormsFavorites) {
      const parsedForms = JSON.parse(storedFormsFavorites);
      console.log('Forms Favourites:', parsedForms); // Debugging
      setFormsFavorites(parsedForms);
    }

    if (storedResourcesFavorites) {
      const parsedResources = JSON.parse(storedResourcesFavorites);
      console.log('Resources Favourites:', parsedResources); // Debugging
      setResourcesFavorites(parsedResources);
    }
  }, []);

  // Listen for changes in localStorage to update favourites in real-time
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'formsFavorites' && event.newValue) {
        setFormsFavorites(JSON.parse(event.newValue));
      }
      if (event.key === 'resourcesFavorites' && event.newValue) {
        setResourcesFavorites(JSON.parse(event.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    console.log('Teams Context:', teamsContext);
    console.log('SQL Data:', sqlData);
    console.log('Enquiries:', enquiries);
  }, [teamsContext, sqlData, enquiries]);

  useEffect(() => {
    const generateGreeting = (firstName: string): string => {
      const currentHour = new Date().getHours();
      let timeOfDay = 'Hello';

      if (currentHour < 12) {
        timeOfDay = 'Good Morning';
      } else if (currentHour < 18) {
        timeOfDay = 'Good Afternoon';
      } else {
        timeOfDay = 'Good Evening';
      }

      return `${timeOfDay}, ${firstName}.`;
    };

    if (
      sqlData &&
      Array.isArray(sqlData) &&
      sqlData.length > 0 &&
      (sqlData[0].First || sqlData[0].First_Name)
    ) {
      const firstName = sqlData[0].First || sqlData[0].First_Name || 'User';
      setGreeting(generateGreeting(firstName));
    } else {
      setGreeting('Hello, User.');
    }
  }, [sqlData]);

  useEffect(() => {
    if (!teamsContext) {
      setIsValidatingUser(true);
    } else {
      setIsValidatingUser(false);
    }
  }, [teamsContext]);

  useEffect(() => {
    if (isSqlLoading) {
      setIsExtractingData(true);
    } else {
      setIsExtractingData(false);
    }
  }, [isSqlLoading]);

  useEffect(() => {
    const fetchEnquiriesData = async () => {
      if (!teamsContext || !teamsContext.userPrincipalName) {
        console.warn('User is not authenticated.');
        setIsProcessingEnquiries(false);
        return;
      }

      setIsProcessingEnquiries(true);
      try {
        const userEmail = teamsContext.userPrincipalName;
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());

        const dateFrom = startOfMonth.toISOString().split('T')[0];
        const dateTo = today.toISOString().split('T')[0];

        const fetchedEnquiries = await fetchEnquiries(userEmail, dateFrom, dateTo);
        console.log('Fetched Enquiries:', fetchedEnquiries);

        const todayCount = fetchedEnquiries.filter((enquiry: any) => {
          if (!enquiry.Touchpoint_Date) return false;
          const enquiryDate = new Date(enquiry.Touchpoint_Date);
          return enquiryDate.toDateString() === today.toDateString();
        }).length;

        const weekToDateCount = fetchedEnquiries.filter((enquiry: any) => {
          if (!enquiry.Touchpoint_Date) return false;
          const enquiryDate = new Date(enquiry.Touchpoint_Date);
          return enquiryDate >= startOfWeek && enquiryDate <= today;
        }).length;

        const monthToDateCount = fetchedEnquiries.filter((enquiry: any) => {
          if (!enquiry.Touchpoint_Date) return false;
          const enquiryDate = new Date(enquiry.Touchpoint_Date);
          return enquiryDate >= startOfMonth && enquiryDate <= today;
        }).length;

        setEnquiriesToday(todayCount);
        setEnquiriesWeekToDate(weekToDateCount);
        setEnquiriesMonthToDate(monthToDateCount);

        setIsProcessingEnquiries(false);
      } catch (error) {
        console.error('Error fetching enquiries:', error);
        setIsProcessingEnquiries(false);
      }
    };

    fetchEnquiriesData();
  }, [fetchEnquiries, teamsContext]);

  const columns = useMemo(() => createColumnsFunction(isDarkMode), [isDarkMode]);

  const handleActionClick = (action: QuickLink) => {
    setSelectedAction(action);
    setIsPanelOpen(true);
  };

  const handleFormSubmit = () => {
    console.log('Form submitted for action:', selectedAction?.title);
    setIsPanelOpen(false);
  };

  // Existing copyToClipboard function
  const copyToClipboard = (url: string, title: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        // You can set a state here if you want to show a success message
        console.log(`Copied '${title}' to clipboard.`);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  };

  // Define metrics data for grid layout
  const metricsData = [
    {
      title: 'WIP',
      today: { money: recordedTime.money, hours: recordedTime.hours, prevMoney: prevRecordedTime.money, prevHours: prevRecordedTime.hours },
      weekToDate: { money: recordedTime.money, hours: recordedTime.hours, prevMoney: prevRecordedTime.money, prevHours: prevRecordedTime.hours },
      monthToDate: { money: recordedTime.money, hours: recordedTime.hours, prevMoney: prevRecordedTime.money, prevHours: prevRecordedTime.hours },
      isTimeMoney: true,
    },
    {
      title: 'Enquiries',
      today: { count: enquiriesToday, prevCount: prevEnquiriesToday },
      weekToDate: { count: enquiriesWeekToDate, prevCount: prevEnquiriesWeekToDate },
      monthToDate: { count: enquiriesMonthToDate, prevCount: prevEnquiriesMonthToDate },
      isTimeMoney: false,
    },
    {
      title: 'Tasks',
      today: { count: todaysTasks, prevCount: prevTodaysTasks },
      weekToDate: { count: tasksDueThisWeek, prevCount: prevTasksDueThisWeek },
      monthToDate: { count: completedThisWeek, prevCount: prevCompletedThisWeek },
      isTimeMoney: false,
    },
  ];

  // Implementing the custom typing effect for greeting
  useEffect(() => {
    let currentIndex = 0;
    setTypedGreeting(''); // Reset typed greeting when greeting changes

    const typingInterval = setInterval(() => {
      if (currentIndex < greeting.length) {
        setTypedGreeting((prev) => prev + greeting[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(typingInterval); // Stop typing when full text is displayed
      }
    }, 25); // Adjust typing speed here (50ms per character)

    return () => clearInterval(typingInterval); // Clean up interval on unmount or when greeting changes
  }, [greeting]);

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Greeting */}
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center" className={headerStyle}>
        {/* Removed <Typed> component and using custom typing effect */}
        <Text className={greetingStyle(isDarkMode)}>{typedGreeting}</Text>
      </Stack>

      {/* Main Content: Quick Actions, Metrics, Favourites, In Office, On Leave */}
      <Stack className={mainContentStyle} tokens={{ childrenGap: 40 }}>
        {/* Row 1: Quick Actions and Metrics */}
        <div className={sectionRowStyle}>
          {/* Quick Actions Section */}
          <div className={quickLinksStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 25 }}>
              {/* Quick Actions Header */}
              <Text className={sectionLabelStyle(isDarkMode)}>Quick Actions</Text>
              <Stack tokens={{ childrenGap: 10 }}>
                {quickActions.map((action: QuickLink) => (
                  <QuickActionsCard
                    key={action.title}
                    title={action.title}
                    icon={action.icon}
                    isDarkMode={isDarkMode}
                    onClick={() => handleActionClick(action)}
                    iconColor={colours.highlight} // Set icon color to highlight
                  />
                ))}
              </Stack>
            </Stack>
          </div>

          {/* Updated Metrics Section with Grid Layout */}
          <div className={metricsContainerStyle(isDarkMode)}>
            {/* Empty cell in the top-left corner */}
            <div style={{ gridColumn: '1', gridRow: '1' }}></div>

            {/* Top Labels */}
            <Text
              style={{ gridColumn: '2', gridRow: '1', textAlign: 'center' }}
              className={mergeStyles({
                fontWeight: '600',
                fontSize: '16px',
                color: isDarkMode ? colours.dark.text : colours.light.text,
              })}
            >
              Today
            </Text>
            <Text
              style={{ gridColumn: '3', gridRow: '1', textAlign: 'center' }}
              className={mergeStyles({
                fontWeight: '600',
                fontSize: '16px',
                color: isDarkMode ? colours.dark.text : colours.light.text,
              })}
            >
              Week to Date
            </Text>
            <Text
              style={{ gridColumn: '4', gridRow: '1', textAlign: 'center' }}
              className={mergeStyles({
                fontWeight: '600',
                fontSize: '16px',
                color: isDarkMode ? colours.dark.text : colours.light.text,
              })}
            >
              Month to Date
            </Text>

            {/* Side Labels and Metric Cards */}
            {metricsData.map((metric: any, rowIndex: number) => (
              <React.Fragment key={metric.title}>
                <Text
                  style={{ gridColumn: '1', gridRow: `${rowIndex + 2}` }}
                  className={metricsSidebarLabelStyle(isDarkMode)}
                >
                  {metric.title}
                </Text>

                {['today', 'weekToDate', 'monthToDate'].map((period: string, colIndex: number) => (
                  <div
                    key={`${metric.title}-${period}`}
                    style={{
                      gridColumn: `${colIndex + 2}`,
                      gridRow: `${rowIndex + 2}`,
                    }}
                  >
                    <MetricCard
                      title={metric.title}
                      {...(metric.isTimeMoney
                        ? {
                            money: metric[period].money,
                            hours: metric[period].hours,
                            prevMoney: metric[period].prevMoney,
                            prevHours: metric[period].prevHours,
                            isTimeMoney: metric.isTimeMoney,
                          }
                        : {
                            count: metric[period].count,
                            prevCount: metric[period].prevCount,
                          })}
                      isDarkMode={isDarkMode}
                      animationDelay={calculateAnimationDelay(rowIndex, colIndex)} // Pass animation delay
                    />
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* New Favourites Section */}
        <div
          className={mergeStyles({
            backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            padding: '20px',
            borderRadius: '12px',
            boxShadow: isDarkMode
              ? `0 4px 12px ${colours.dark.border}`
              : `0 4px 12px ${colours.light.border}`,
            transition: 'background-color 0.3s, box-shadow 0.3s',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          })}
        >
          <Text
            className={mergeStyles({
              fontWeight: '700',
              fontSize: '24px',
              color: isDarkMode ? colours.dark.text : colours.light.text,
            })}
          >
            Favourites
          </Text>

          {/* Sub-section: Forms Favourites */}
          {formsFavorites.length > 0 && (
            <div className={subSectionContainerStyle}>
              <div className={favouritesGridStyle}>
                {formsFavorites.map((form: FormItem, index: number) => (
                  <FormCard
                    key={form.title}
                    link={form}
                    isFavorite={true}
                    onCopy={(url: string, title: string) => copyToClipboard(url, title)}
                    onSelect={() => setSelectedForm(form)}
                    onToggleFavorite={() => {
                      const updatedFavorites = formsFavorites.filter(fav => fav.title !== form.title);
                      setFormsFavorites(updatedFavorites);
                      localStorage.setItem('formsFavorites', JSON.stringify(updatedFavorites));
                    }}
                    onGoTo={() => {
                      window.open(form.url, '_blank');
                    }}
                    animationDelay={index * 0.1} // Calculate delay based on index
                  />
                ))}

                {resourcesFavorites.map((resource: Resource, index: number) => (
                  <ResourceCard
                    key={resource.title}
                    resource={resource}
                    isFavorite={true}
                    onCopy={(url: string, title: string) => copyToClipboard(url, title)}
                    onToggleFavorite={(res) => {
                      const updatedFavorites = resourcesFavorites.filter(fav => fav.title !== res.title);
                      setResourcesFavorites(updatedFavorites);
                      localStorage.setItem('resourcesFavorites', JSON.stringify(updatedFavorites));
                    }}
                    onGoTo={(url) => window.open(url, '_blank')}
                    onSelect={() => setSelectedResource(resource)}
                    animationDelay={index * 0.1} // Calculate delay based on index
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sub-section: Resources Favourites */}
          {resourcesFavorites.length > 0 && (
            <div className={subSectionContainerStyle}>
              <div style={{ marginBottom: '15px' }}>
                <Text className={subLabelStyle(isDarkMode)}>Resources</Text>
              </div>
              <div className={favouritesGridStyle}>
                {resourcesFavorites.map((resource: Resource) => (
                  <ResourceCard
                    key={resource.title}
                    resource={resource}
                    isFavorite={true}
                    onCopy={(url: string, title: string) => copyToClipboard(url, title)}
                    onToggleFavorite={() => {
                      const updatedFavorites = resourcesFavorites.filter(fav => fav.title !== resource.title);
                      setResourcesFavorites(updatedFavorites);
                      localStorage.setItem('resourcesFavorites', JSON.stringify(updatedFavorites));
                    }}
                    onGoTo={() => window.open(resource.url, '_blank')}
                    onSelect={() => setSelectedResource(resource)}
                    // Removed animationDelay here to avoid duplicate cards animation
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Row 2: In the Office Today and On Annual Leave Today */}
        <div className={sectionRowStyle}>
          {/* In the Office Today Section */}
          <div className={officeLeaveContainerStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 20 }}>
              <Text className={sectionLabelStyle(isDarkMode)}>In the Office Today</Text>
              <Stack horizontal wrap tokens={{ childrenGap: 10 }}>
                {inOfficePeople.map((person: Person, index: number) => (
                  <Persona
                    key={index}
                    text={person.initials}
                    imageUrl={HelixAvatar}
                    size={PersonaSize.size40}
                    presence={person.presence}
                    styles={{
                      root: { width: 100 },
                      primaryText: { fontSize: 14, color: isDarkMode ? colours.dark.text : colours.light.text },
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          </div>

          {/* On Annual Leave Today Section */}
          <div className={officeLeaveContainerStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 20 }}>
              <Text className={sectionLabelStyle(isDarkMode)}>On Annual Leave Today</Text>
              <Stack horizontal wrap tokens={{ childrenGap: 10 }}>
                {onLeavePeople.map((person: Person, index: number) => (
                  <Persona
                    key={index}
                    text={person.initials}
                    imageUrl={HelixAvatar}
                    size={PersonaSize.size40}
                    presence={person.presence}
                    styles={{
                      root: { width: 100 },
                      primaryText: { fontSize: 14, color: isDarkMode ? colours.dark.text : colours.light.text },
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          </div>
        </div>
      </Stack>

      {/* Collapsible Contexts Section */}
      <div
        className={mergeStyles({
          backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
          padding: '20px',
          borderRadius: '12px',
          boxShadow: isDarkMode
            ? `0 4px 12px ${colours.dark.border}`
            : `0 4px 12px ${colours.light.border}`,
          transition: 'background-color 0.3s, box-shadow 0.3s',
          width: '100%',
          marginTop: '40px', // Increased margin top for spacing
        })}
      >
        {/* Header with toggle button */}
        <div
          className={mergeStyles({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          })}
        >
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
            <Text className={cardTitleStyle(isDarkMode)}>Contexts</Text>
            <Stack horizontal tokens={{ childrenGap: 5 }}>
              <Text style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>Teams Context</Text>
              <Text style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>|</Text>
              <Text style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>SQL Context</Text>
            </Stack>
          </Stack>
          <IconButton
            iconProps={{ iconName: isContextsExpanded ? 'ChevronUp' : 'ChevronDown' }}
            onClick={() => setIsContextsExpanded(!isContextsExpanded)}
            ariaLabel={isContextsExpanded ? 'Collapse Contexts' : 'Expand Contexts'}
          />
        </div>
        {isContextsExpanded && (
          <Stack
            horizontal
            wrap
            tokens={{ childrenGap: 30 }}
            styles={{ root: { width: '100%', alignItems: 'flex-start', marginTop: '20px' } }}
          >
            {/* Teams Context Card */}
            <div
              className={mergeStyles({
                backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                padding: '20px',
                borderRadius: '12px',
                boxShadow: isDarkMode
                  ? `0 4px 12px ${colours.dark.border}`
                  : `0 4px 12px ${colours.light.border}`,
                transition: 'background-color 0.3s, box-shadow 0.3s',
                flex: '1 1 48%',
                minWidth: '250px',
              })}
            >
              <div
                className={mergeStyles({
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '15px',
                })}
              >
                <Text className={cardTitleStyle(isDarkMode)}>Teams Context</Text>
                <TooltipHost content="View detailed Teams context data">
                  <IconButton iconProps={{ iconName: 'Info' }} ariaLabel="Teams Context Info" />
                </TooltipHost>
              </div>
              {isValidatingUser ? (
                <Spinner label="Validating user..." size={SpinnerSize.medium} />
              ) : error ? (
                <MessageBar messageBarType={MessageBarType.error} isMultiline={false}>
                  {error}
                </MessageBar>
              ) : (
                <DetailsList
                  items={transformContext(teamsContext)}
                  columns={columns}
                  setKey="teamsSet"
                  layoutMode={DetailsListLayoutMode.justified}
                  isHeaderVisible={false}
                  styles={{
                    root: {
                      selectors: {
                        '.ms-DetailsRow': {
                          padding: '8px 0',
                          borderBottom: 'none',
                        },
                        '.ms-DetailsHeader': {
                          display: 'none',
                        },
                      },
                    },
                  }}
                />
              )}
            </div>

            {/* SQL Context Card */}
            <div
              className={mergeStyles({
                backgroundColor: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                padding: '20px',
                borderRadius: '12px',
                boxShadow: isDarkMode
                  ? `0 4px 12px ${colours.dark.border}`
                  : `0 4px 12px ${colours.light.border}`,
                transition: 'background-color 0.3s, box-shadow 0.3s',
                flex: '1 1 48%',
                minWidth: '250px',
              })}
            >
              <div
                className={mergeStyles({
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '15px',
                })}
              >
                <Text className={cardTitleStyle(isDarkMode)}>SQL Context</Text>
                <TooltipHost content="View detailed SQL context data">
                  <IconButton iconProps={{ iconName: 'Info' }} ariaLabel="SQL Context Info" />
                </TooltipHost>
              </div>
              {isExtractingData ? (
                <Spinner label="Extracting user data..." size={SpinnerSize.medium} />
              ) : error ? (
                <MessageBar messageBarType={MessageBarType.error} isMultiline={false}>
                  {error}
                </MessageBar>
              ) : (
                <DetailsList
                  items={transformContext(sqlData)}
                  columns={columns}
                  setKey="sqlSet"
                  layoutMode={DetailsListLayoutMode.justified}
                  isHeaderVisible={false}
                  styles={{
                    root: {
                      selectors: {
                        '.ms-DetailsRow': {
                          padding: '8px 0',
                          borderBottom: 'none',
                        },
                        '.ms-DetailsHeader': {
                          display: 'none',
                        },
                      },
                    },
                  }}
                />
              )}
            </div>
          </Stack>
        )}
      </div>

      {/* Footer */}
      <div className={versionStyle}>Version 1.1</div>

      {/* Panel for Quick Action Forms */}
      <Panel
        isOpen={isPanelOpen}
        onDismiss={() => setIsPanelOpen(false)}
        type={PanelType.medium}
        headerText={selectedAction ? selectedAction.title : ''}
        closeButtonAriaLabel="Close"
      >
        {selectedAction?.title === 'Create a Task' && <Tasking />}
        {selectedAction?.title === 'Create a Time Entry' && <CreateTimeEntryForm />}
        {selectedAction?.title === 'Record an Attendance Note' && <TelephoneAttendance />}
        {selectedAction?.title === 'Retrieve a Contact' && <RetrieveContactForm />}
      </Panel>

      {/* Form Details Panel */}
      {selectedForm && (
        <FormDetails
          isOpen={true}
          onClose={() => setSelectedForm(null)} // Corrected prop
          link={selectedForm} // Adjusted from "form"
          isDarkMode={isDarkMode}
        />
      )}

      {/* Resource Details Panel */}
      {selectedResource && (
        <ResourceDetails
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
};

export default Home;
