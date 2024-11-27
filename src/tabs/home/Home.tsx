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
  PrimaryButton,
  TextField,
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
import { useTheme } from '../../app/functionality/ThemeContext'; // Import useTheme

interface HomeProps {
  context: microsoftTeams.Context | null;
  // isDarkMode: boolean; // Removed
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
  gap: '40px', // Increased gap for better spacing
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
    fontWeight: '400',
    fontSize: '24px',
    flexShrink: 0,
    minWidth: '200px',
    marginRight: '20px',
    marginTop: '4px',
    whiteSpace: 'nowrap',
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

const metricsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
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
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
  });

const officeLeaveContainerStyle = (isDarkMode: boolean) =>
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

const cardsContainerStyle = mergeStyles({
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  gap: '20px',
  width: '100%',
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

const quickActions: QuickLink[] = [
  {
    title: 'Create a Task',
    icon: 'Add',
  },
  {
    title: 'Create a Time Entry',
    icon: 'Clock',
  },
  {
    title: 'Record an Attendance Note',
    icon: 'Add',
  },
  {
    title: 'Retrieve a Contact',
    icon: 'Contact',
  },
];

// Updated dummy names with initials
const inOfficePeople: Person[] = [
  { name: 'Alex Cook', initials: 'AC', presence: PersonaPresence.online },
  { name: 'Jonathan Waters', initials: 'JW', presence: PersonaPresence.away },
  { name: 'Lukasz Zemanek', initials: 'LZ', presence: PersonaPresence.busy },
  { name: 'Laura Albon', initials: 'LA', presence: PersonaPresence.online },
];

const onLeavePeople: Person[] = [
  { name: 'Sam Packwood', initials: 'SP', presence: PersonaPresence.away },
  { name: 'Richard Chapman', initials: 'RC', presence: PersonaPresence.offline },
  { name: 'Kanchel White', initials: 'KW', presence: PersonaPresence.away },
];

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
  const [enquiriesToday, setEnquiriesToday] = useState<number>(0);
  const [enquiriesWeekToDate, setEnquiriesWeekToDate] = useState<number>(0);
  const [enquiriesMonthToDate, setEnquiriesMonthToDate] = useState<number>(0);

  const [todaysTasks, setTodaysTasks] = useState<number>(10);
  const [tasksDueThisWeek, setTasksDueThisWeek] = useState<number>(20);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(15);

  const [recordedTime, setRecordedTime] = useState<{ hours: number; money: number }>({ hours: 120, money: 1000 });
  const [collectedTime, setCollectedTime] = useState<{ hours: number; money: number }>({ hours: 80, money: 800 });
  const [awaitingPayment, setAwaitingPayment] = useState<{ hours: number; money: number }>({ hours: 40, money: 400 });

  // Previous period state variables (dummy data)
  const [prevEnquiriesToday, setPrevEnquiriesToday] = useState<number>(8);
  const [prevEnquiriesWeekToDate, setPrevEnquiriesWeekToDate] = useState<number>(18);
  const [prevEnquiriesMonthToDate, setPrevEnquiriesMonthToDate] = useState<number>(950);

  const [prevTodaysTasks, setPrevTodaysTasks] = useState<number>(12);
  const [prevTasksDueThisWeek, setPrevTasksDueThisWeek] = useState<number>(18);
  const [prevCompletedThisWeek, setPrevCompletedThisWeek] = useState<number>(17);

  const [prevRecordedTime, setPrevRecordedTime] = useState<{ hours: number; money: number }>({ hours: 110, money: 900 });
  const [prevCollectedTime, setPrevCollectedTime] = useState<{ hours: number; money: number }>({ hours: 85, money: 750 });
  const [prevAwaitingPayment, setPrevAwaitingPayment] = useState<{ hours: number; money: number }>({ hours: 35, money: 350 });

  const [isValidatingUser, setIsValidatingUser] = useState<boolean>(true);
  const [isExtractingData, setIsExtractingData] = useState<boolean>(true);
  const [isProcessingEnquiries, setIsProcessingEnquiries] = useState<boolean>(true);

  const [isContextsExpanded, setIsContextsExpanded] = useState<boolean>(false);

  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<QuickLink | null>(null);

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

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Greeting */}
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center" className={headerStyle}>
        <Text className={greetingStyle(isDarkMode)}>{greeting}</Text>
      </Stack>

      {/* Main Content: Quick Actions, Metrics, In Office, On Leave */}
      <Stack className={mainContentStyle} tokens={{ childrenGap: 40 }}>
        {/* Row 1: Quick Actions and Metrics */}
        <div className={sectionRowStyle}>
          {/* Quick Actions Section */}
          <div className={quickLinksStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 25 }}>
              {/* Quick Actions Header */}
              <Text className={sectionLabelStyle(isDarkMode)}>Quick Actions</Text>
              <Stack tokens={{ childrenGap: 10 }}>
                {quickActions.map((action) => (
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

          {/* Metrics Section */}
          <div className={metricsContainerStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 30 }} styles={{ root: { height: '100%' } }}>
              {/* WIP Section */}
              <div className={sectionRowStyle}>
                <Text className={sectionLabelStyle(isDarkMode)}>WIP</Text>
                <div className={cardsContainerStyle}>
                  {[
                    {
                      title: 'Recorded Time',
                      data: recordedTime,
                      prevData: prevRecordedTime,
                      isTimeMoney: true,
                    },
                    {
                      title: 'Collected Time',
                      data: collectedTime,
                      prevData: prevCollectedTime,
                      isTimeMoney: true,
                    },
                    {
                      title: 'Awaiting Payment',
                      data: awaitingPayment,
                      prevData: prevAwaitingPayment,
                      isTimeMoney: true,
                    },
                  ].map((item) => (
                    <MetricCard
                      key={item.title}
                      title={item.title}
                      money={item.data.money}
                      hours={item.data.hours}
                      prevMoney={item.prevData.money}
                      prevHours={item.prevData.hours}
                      isDarkMode={isDarkMode}
                      isTimeMoney={item.isTimeMoney}
                    />
                  ))}
                </div>
              </div>

              {/* Enquiries Section */}
              <div className={sectionRowStyle}>
                <Text className={sectionLabelStyle(isDarkMode)}>Enquiries</Text>
                <div className={cardsContainerStyle}>
                  {[
                    {
                      label: 'Daily',
                      current: enquiriesToday,
                      previous: prevEnquiriesToday,
                    },
                    {
                      label: 'Weekly',
                      current: enquiriesWeekToDate,
                      previous: prevEnquiriesWeekToDate,
                    },
                    {
                      label: 'Monthly',
                      current: enquiriesMonthToDate,
                      previous: prevEnquiriesMonthToDate,
                    },
                  ].map((item) => (
                    <MetricCard
                      key={item.label}
                      title={item.label}
                      count={item.current}
                      prevCount={item.previous}
                      isDarkMode={isDarkMode}
                    />
                  ))}
                </div>
              </div>

              {/* Tasks Section */}
              <div className={sectionRowStyle}>
                <Text className={sectionLabelStyle(isDarkMode)}>Tasks</Text>
                <div className={cardsContainerStyle}>
                  {[
                    {
                      label: 'Daily',
                      current: todaysTasks,
                      previous: prevTodaysTasks,
                    },
                    {
                      label: 'Weekly',
                      current: tasksDueThisWeek,
                      previous: prevTasksDueThisWeek,
                    },
                    {
                      label: 'Monthly',
                      current: completedThisWeek,
                      previous: prevCompletedThisWeek,
                    },
                  ].map((item) => (
                    <MetricCard
                      key={item.label}
                      title={item.label}
                      count={item.current}
                      prevCount={item.previous}
                      isDarkMode={isDarkMode}
                    />
                  ))}
                </div>
              </div>
            </Stack>
          </div>
        </div>

        {/* Row 2: In the Office Today and On Annual Leave Today */}
        <div className={sectionRowStyle}>
          {/* In the Office Today Section */}
          <div className={officeLeaveContainerStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 20 }}>
              <Text className={sectionLabelStyle(isDarkMode)}>In the Office Today</Text>
              <Stack horizontal wrap tokens={{ childrenGap: 10 }}>
                {inOfficePeople.map((person, index) => (
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
                {onLeavePeople.map((person, index) => (
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
          <Stack horizontal wrap tokens={{ childrenGap: 30 }} styles={{ root: { width: '100%', alignItems: 'flex-start', marginTop: '20px' } }}>
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
              <div className={mergeStyles({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' })}>
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
              <div className={mergeStyles({ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' })}>
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
        {selectedAction && (
          <form>
            <Stack tokens={{ childrenGap: 15 }}>
              <TextField label="Sample Input 1" required />
              <TextField label="Sample Input 2" required />
              <TextField label="Sample Input 3" multiline rows={3} />
              <PrimaryButton onClick={handleFormSubmit}>Submit</PrimaryButton>
            </Stack>
          </form>
        )}
      </Panel>
    </div>
  );
};

export default Home;
