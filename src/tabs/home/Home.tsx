// src/tabs/home/Home.tsx

import React, { useState, useEffect, useMemo } from 'react';
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
  DefaultButton,
  Icon,
} from '@fluentui/react';
import { colours } from '../../app/styles/colours';
import { initializeIcons } from '@fluentui/react/lib/Icons';
import MetricCard from './MetricCard';
import GreyHelixMark from '../../assets/grey helix mark.png';
import HelixAvatar from '../../assets/helix avatar.png';
import '../../app/styles/VerticalLabelPanel.css';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/MetricCard.css';

import Tasking from '../../CustomForms/Tasking';
import TelephoneAttendance from '../../CustomForms/TelephoneAttendance';
import RetrieveContactForm from '../../CustomForms/RetrieveContactForm';
import CreateTimeEntryForm from '../../CustomForms/CreateTimeEntryForm';

import FormCard from '../forms/FormCard';
import ResourceCard from '../resources/ResourceCard';

import { FormItem } from '../forms/Forms';
import { Resource } from '../resources/Resources';

import FormDetails from '../forms/FormDetails';
import ResourceDetails from '../resources/ResourceDetails';

import HomePanel from './HomePanel';
import { officeAttendanceForm, annualLeaveForm } from './HomeForms';

import { Context as TeamsContextType } from '@microsoft/teams-js';

interface HomeProps {
  context: TeamsContextType | null;
  userData: any;
  enquiries: any[] | null;
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
  nickname?: string;
}

const quickActions: QuickLink[] = [
  { title: 'Create a Task', icon: 'Checklist' },
  { title: 'Create a Time Entry', icon: 'Clock' },
  { title: 'Save Telephone Note', icon: 'Comment' },
  { title: 'Save Attendance Note', icon: 'NotePinned' },
  { title: 'Create a Contact', icon: 'AddFriend' },
  { title: 'Retrieve a Contact', icon: 'Contact' },
];

const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    padding: '20px',
    minHeight: '100vh',
    boxSizing: 'border-box',
  });

const headerStyle = mergeStyles({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: '10px 0px',
});

const greetingStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '32px',
    whiteSpace: 'nowrap',
    color: isDarkMode ? colours.dark.text : colours.light.text,
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

const officeSectionRowStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: '1fr min-content 1fr',
  alignItems: 'stretch',
  width: '100%',
  gap: '20px',
});

const verticalPipeStyle = mergeStyles({
  backgroundColor: 'rgba(128,128,128,0.3)',
  width: '1px',
  height: '75%',
  justifySelf: 'center',
  alignSelf: 'center',
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
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(2, 1fr)',
    gap: '20px',
  });

const calculateAnimationDelay = (row: number, col: number) => {
  return (row + col) * 0.1;
};

const metricsContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gridTemplateRows: 'repeat(2, 1fr)',
    gap: '20px',
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
    position: 'relative',
    overflow: 'visible',
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
  marginTop: '40px',
});

const subLabelStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '20px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const favouritesGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: '20px',
  '@media (min-width: 1000px)': {
    gridTemplateColumns: 'repeat(5, 1fr)',
  },
});

const peopleGridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '20px',
  alignItems: 'center',
  width: '100%',
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
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  });

const flattenObject = (obj: any, prefix = ''): { key: string; value: any }[] => {
  let result: { key: string; value: any }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      result = result.concat(flattenObject(v, newKey));
    } else {
      result.push({ key: newKey, value: v });
    }
  }
  return result;
};

const transformContext = (contextObj: any): { key: string; value: string }[] => {
  if (!contextObj || typeof contextObj !== 'object') {
    console.warn('Invalid context object:', contextObj);
    return [];
  }

  const flattened = flattenObject(contextObj);
  return flattened.map(({ key, value }) => ({
    key,
    value: typeof value === 'object' ? JSON.stringify(value) : String(value),
  }));
};

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

const QuickActionsCardStyled: React.FC<{
  title: string;
  icon: string;
  isDarkMode: boolean;
  onClick: () => void;
  animationDelay?: number;
}> = ({ title, icon, isDarkMode, onClick, animationDelay = 0 }) => {
  const quickActionCardStyle = mergeStyles({
    backgroundColor: '#ffffff', // Always white
    color: isDarkMode ? colours.dark.text : colours.light.text,
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)', // Subtle initial shadow
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '150px',
    cursor: 'pointer',
    position: 'relative',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: 'fadeInUp 0.3s ease forwards',
    animationDelay: `${animationDelay}s`,
    transition: 'transform 0.3s, box-shadow 0.3s',
    ':hover': {
      transform: 'translateY(-5px)',
      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2)', // Intensified shadow on hover
    },
  });

  const quickActionIconStyle = mergeStyles({
    fontSize: '80px',
    color: '#ccc',
    position: 'absolute',
    left: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    opacity: 0.2,
    pointerEvents: 'none',
  });

  const quickActionLabelStyle = mergeStyles({
    fontWeight: '600',
    fontSize: '18px',
    color: colours.highlight, // Always blue
    textAlign: 'center',
    zIndex: 1,
  });

  return (
    <div className={quickActionCardStyle} onClick={onClick} aria-label={title}>
      <Icon iconName={icon} className={quickActionIconStyle} />
      <Text className={quickActionLabelStyle}>{title}</Text>
    </div>
  );
};

const PersonBubble: React.FC<{ person: Person; isDarkMode: boolean; animationDelay?: number }> = ({
  person,
  isDarkMode,
  animationDelay,
}) => {
  const isAttending = person.presence === PersonaPresence.online;

  const bubbleStyle = mergeStyles({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: 'fadeInUp 0.3s ease forwards',
    animationDelay: `${animationDelay}s`,
  });

  const textBubbleStyle = mergeStyles({
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    backgroundColor: colours.grey,
    borderRadius: '12px',
    padding: '0 10px 0 50px',
    height: '34px',
    display: 'flex',
    alignItems: 'center',
    zIndex: 3,
    whiteSpace: 'nowrap',
  });

  const textStyle = mergeStyles({ color: isDarkMode ? colours.dark.text : colours.light.text });

  if (isAttending) {
    return (
      <div className={bubbleStyle}>
        <div style={{ position: 'relative', zIndex: 4 }}>
          <Persona
            text=""
            imageUrl={HelixAvatar}
            size={PersonaSize.size40}
            presence={PersonaPresence.online}
            hidePersonaDetails={true}
            styles={{
              root: { zIndex: 4 },
            }}
          />
          <div className={textBubbleStyle}>
            <Text className={textStyle}>{person.nickname || person.name}</Text>
          </div>
        </div>
      </div>
    );
  } else {
    return (
      <div className={bubbleStyle}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: `0.5px solid ${colours.darkBlue}`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
            zIndex: 4,
          }}
        >
          <Icon iconName="Home" styles={{ root: { color: colours.darkBlue, fontSize: 16 } }} />
        </div>
        <div className={textBubbleStyle}>
          <Text className={textStyle}>{person.nickname || person.name}</Text>
        </div>
      </div>
    );
  }
};

let cachedAttendance: any[] | null = null;
let cachedAttendanceError: string | null = null;
let cachedTeamData: any[] | null = null;

let cachedWipClio: any | null = null;
let cachedWipClioError: string | null = null;

let cachedRecovered: number | null = null;
let cachedRecoveredError: string | null = null;

const Home: React.FC<HomeProps> = ({ context, userData, enquiries }) => {
  const { isDarkMode } = useTheme();
  const [greeting, setGreeting] = useState<string>('');
  const [typedGreeting, setTypedGreeting] = useState<string>('');
  const [enquiriesToday, setEnquiriesToday] = useState<number>(0);
  const [enquiriesWeekToDate, setEnquiriesWeekToDate] = useState<number>(0);
  const [enquiriesMonthToDate, setEnquiriesMonthToDate] = useState<number>(0);
  const [todaysTasks, setTodaysTasks] = useState<number>(10);
  const [tasksDueThisWeek, setTasksDueThisWeek] = useState<number>(20);
  const [completedThisWeek, setCompletedThisWeek] = useState<number>(15);
  const [recordedTime, setRecordedTime] = useState<{ hours: number; money: number }>({
    hours: 120,
    money: 1000,
  });
  const [prevEnquiriesToday, setPrevEnquiriesToday] = useState<number>(8);
  const [prevEnquiriesWeekToDate, setPrevEnquiriesWeekToDate] = useState<number>(18);
  const [prevEnquiriesMonthToDate, setPrevEnquiriesMonthToDate] = useState<number>(950);
  const [prevTodaysTasks, setPrevTodaysTasks] = useState<number>(12);
  const [prevTasksDueThisWeek, setPrevTasksDueThisWeek] = useState<number>(18);
  const [prevCompletedThisWeek, setPrevCompletedThisWeek] = useState<number>(17);
  const [prevRecordedTime, setPrevRecordedTime] = useState<{ hours: number; money: number }>({
    hours: 110,
    money: 900,
  });
  const [isContextsExpanded, setIsContextsExpanded] = useState<boolean>(false);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] = useState<QuickLink | null>(null);
  const [formsFavorites, setFormsFavorites] = useState<FormItem[]>([]);
  const [resourcesFavorites, setResourcesFavorites] = useState<Resource[]>([]);
  const [selectedForm, setSelectedForm] = useState<FormItem | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [isOfficeAttendancePanelOpen, setIsOfficeAttendancePanelOpen] = useState<boolean>(false);
  const [isAnnualLeavePanelOpen, setIsAnnualLeavePanelOpen] = useState<boolean>(false);
  const [attendanceRecords, setAttendanceRecords] = useState<
    { name: string; confirmed: boolean; attendingToday: boolean }[]
  >([]);
  const [teamData, setTeamData] = useState<
    { First: string; Initials: string; ['Entra ID']: string; Nickname?: string }[]
  >([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('User');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  const [wipClioData, setWipClioData] = useState<any | null>(cachedWipClio);
  const [wipClioError, setWipClioError] = useState<string | null>(cachedWipClioError);
  const [isLoadingWipClio, setIsLoadingWipClio] = useState<boolean>(!cachedWipClio && !cachedWipClioError);

  const [recoveredData, setRecoveredData] = useState<number | null>(cachedRecovered);
  const [recoveredError, setRecoveredError] = useState<string | null>(cachedRecoveredError);
  const [isLoadingRecovered, setIsLoadingRecovered] = useState<boolean>(!cachedRecovered && !cachedRecoveredError);

  const columnsForPeople = 3;

  useEffect(() => {
    const styles = `
@keyframes redPulse {
    0% {
        box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.4);
    }
    70% {
        box-shadow: 0 0 0 10px rgba(255, 0, 0, 0);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(255, 0, 0, 0);
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
@keyframes fadeInFromTopLeft {
    0% {
        opacity: 0;
        transform: translate(-20px, -20px);
    }
    100% {
        opacity: 1,
        transform: translate(0, 0);
    }
}
@keyframes fadeInFromTopRight {
    0% {
        opacity: 0;
        transform: translate(20px, -20px);
    }
    100% {
        opacity: 1,
        transform: translate(0, 0);
    }
}
@keyframes fadeInFromBottomLeft {
    0% {
        opacity: 0;
        transform: translate(-20px, 20px);
    }
    100% {
        opacity: 1,
        transform: translate(0, 0);
    }
}
@keyframes fadeInFromBottomRight {
    0% {
        opacity: 0;
        transform: translate(20px, 20px);
    }
    100% {
        opacity: 1,
        transform: translate(0, 0);
    }
}`;
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  useEffect(() => {
    const storedFormsFavorites = localStorage.getItem('formsFavorites');
    const storedResourcesFavorites = localStorage.getItem('resourcesFavorites');

    if (storedFormsFavorites) {
      const parsedForms = JSON.parse(storedFormsFavorites);
      setFormsFavorites(parsedForms);
    }

    if (storedResourcesFavorites) {
      const parsedResources = JSON.parse(storedResourcesFavorites);
      setResourcesFavorites(parsedResources);
    }
  }, []);

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
    if (userData && Array.isArray(userData) && userData.length > 0 && (userData[0].First || userData[0].First_Name)) {
      const firstName = userData[0].First || userData[0].First_Name || 'User';
      setCurrentUserName(firstName);
      const email = userData[0].Email || '';
      setCurrentUserEmail(email);
      const currentHour = new Date().getHours();
      let timeOfDay = 'Hello';
      if (currentHour < 12) {
        timeOfDay = 'Good Morning';
      } else if (currentHour < 18) {
        timeOfDay = 'Good Afternoon';
      } else {
        timeOfDay = 'Good Evening';
      }
      setGreeting(`${timeOfDay}, ${firstName}.`);
    } else {
      setGreeting('Hello, User.');
    }
  }, [userData]);

  useEffect(() => {
    if (enquiries) {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

      const todayCount = enquiries.filter((enquiry: any) => {
        if (!enquiry.Touchpoint_Date) return false;
        const enquiryDate = new Date(enquiry.Touchpoint_Date);
        return enquiryDate.toDateString() === today.toDateString() && enquiry.Point_of_Contact === currentUserEmail;
      }).length;

      const weekToDateCount = enquiries.filter((enquiry: any) => {
        if (!enquiry.Touchpoint_Date) return false;
        const enquiryDate = new Date(enquiry.Touchpoint_Date);
        return enquiryDate >= startOfWeek && enquiryDate <= today && enquiry.Point_of_Contact === currentUserEmail;
      }).length;

      const monthToDateCount = enquiries.filter((enquiry: any) => {
        if (!enquiry.Touchpoint_Date) return false;
        const enquiryDate = new Date(enquiry.Touchpoint_Date);
        return enquiryDate >= startOfMonth && enquiryDate <= today && enquiry.Point_of_Contact === currentUserEmail;
      }).length;

      setEnquiriesToday(todayCount);
      setEnquiriesWeekToDate(weekToDateCount);
      setEnquiriesMonthToDate(monthToDateCount);
    }
  }, [enquiries, currentUserEmail]);

  useEffect(() => {
    let currentIndex = 0;
    setTypedGreeting('');
    const typingInterval = setInterval(() => {
      if (currentIndex < greeting.length) {
        setTypedGreeting((prev) => prev + greeting[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 25);
    return () => clearInterval(typingInterval);
  }, [greeting]);

  useEffect(() => {
    if (cachedAttendance || cachedAttendanceError) {
      setAttendanceRecords(cachedAttendance || []);
      setTeamData(cachedTeamData || []);
      setAttendanceError(cachedAttendanceError);
      setIsLoadingAttendance(false);
    } else {
      const fetchAttendance = async () => {
        try {
          setIsLoadingAttendance(true);
          const response = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_ATTENDANCE_PATH}?code=${process.env.REACT_APP_GET_ATTENDANCE_CODE}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }
          );
          if (!response.ok) throw new Error(`Failed to fetch attendance: ${response.status}`);
          const data = await response.json();

          cachedAttendance = data.attendance;
          cachedTeamData = data.team;
          setAttendanceRecords(data.attendance);
          setTeamData(data.team);
        } catch (error: any) {
          console.error('Error fetching attendance:', error);
          cachedAttendanceError = error.message || 'Unknown error occurred.';
          setAttendanceError(error.message || 'Unknown error occurred.');
          setAttendanceRecords([]);
          setTeamData([]);
        } finally {
          setIsLoadingAttendance(false);
        }
      };

      fetchAttendance();
    }
  }, []);

  useEffect(() => {
    if (cachedWipClio || cachedWipClioError || cachedRecovered || cachedRecoveredError) {
      setWipClioData(cachedWipClio);
      setWipClioError(cachedWipClioError);
      setRecoveredData(cachedRecovered);
      setRecoveredError(cachedRecoveredError);
      setIsLoadingWipClio(false);
      setIsLoadingRecovered(false);
    } else {
      const fetchWipClioAndRecovered = async () => {
        try {
          setIsLoadingWipClio(true);
          setIsLoadingRecovered(true);
          const clioID = parseInt(userData[0]["Clio ID"], 10);
          const [wipResponse, recoveredResponse] = await Promise.all([
            fetch(
              `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_WIP_CLIO_PATH}?code=${process.env.REACT_APP_GET_WIP_CLIO_CODE}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ClioID: clioID }),
              }
            ),
            fetch(
              `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_RECOVERED_PATH}?code=${process.env.REACT_APP_GET_RECOVERED_CODE}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ClioID: clioID }),
              }
            ),
          ]);

          if (!wipResponse.ok) throw new Error(`Failed to fetch WIP Clio: ${wipResponse.status}`);
          const wipData = await wipResponse.json();
          cachedWipClio = wipData;
          setWipClioData(wipData);

          if (!recoveredResponse.ok) throw new Error(`Failed to fetch Recovered: ${recoveredResponse.status}`);
          const recoveredData = await recoveredResponse.json();
          cachedRecovered = recoveredData.totalPaymentAllocated;
          setRecoveredData(recoveredData.totalPaymentAllocated);
        } catch (error: any) {
          console.error('Error fetching WIP Clio or Recovered:', error);
          if (error.message.includes('WIP Clio')) {
            cachedWipClioError = error.message || 'Unknown error occurred.';
            setWipClioError(error.message || 'Unknown error occurred.');
            setWipClioData(null);
          } else {
            cachedRecoveredError = error.message || 'Unknown error occurred.';
            setRecoveredError(error.message || 'Unknown error occurred.');
            setRecoveredData(null);
          }
        } finally {
          setIsLoadingWipClio(false);
          setIsLoadingRecovered(false);
        }
      };

      fetchWipClioAndRecovered();
    }
  }, [userData]);

  const columns = useMemo(() => createColumnsFunction(isDarkMode), [isDarkMode]);

  const handleActionClick = (action: QuickLink) => {
    setSelectedAction(action);
    setIsPanelOpen(true);
  };

  const copyToClipboardHandler = (url: string, title: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        console.log(`Copied '${title}' to clipboard.`);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
      });
  };

  const currentUserRecord = attendanceRecords.find((r) => r.name === currentUserName);
  const currentUserConfirmed = currentUserRecord ? currentUserRecord.confirmed : false;
  const officeAttendanceButtonText = currentUserConfirmed
    ? 'Update Office Attendance'
    : 'Confirm Office Attendance';

  const today = new Date();
  const formattedToday = today.toISOString().split('T')[0];
  const day = today.getDay();
  let officeSectionTitle = 'In the Office Today';
  if (day === 6) {
    officeSectionTitle = 'In the Office on Monday';
  } else if (day === 0) {
    officeSectionTitle = 'In the Office Tomorrow';
  }

  const allPeople = useMemo(() => {
    if (!teamData || teamData.length === 0) return [];
    return teamData
      .sort((a, b) => a.First.localeCompare(b.First))
      .map((t) => {
        const att = attendanceRecords.find((a) => a.name.toLowerCase() === t.First.toLowerCase());
        const attending = att ? att.attendingToday : false;
        return {
          name: t.First,
          initials: t.Initials,
          presence: attending ? PersonaPresence.online : PersonaPresence.none,
          nickname: t.Nickname || t.First,
        };
      });
  }, [teamData, attendanceRecords]);

  const metricsData = useMemo(() => {
    if (!wipClioData) {
      return [
        {
          title: 'Time Today',
          isTimeMoney: true,
          money: 0,
          hours: 0,
          prevMoney: 0,
          prevHours: 0,
        },
        {
          title: 'Av. Time This Week',
          isTimeMoney: true,
          money: 0,
          hours: 0,
          prevMoney: 0,
          prevHours: 0,
        },
        {
          title: 'Fees Recovered This Month',
          isMoneyOnly: true,
          money: '--',
          prevMoney: 0,
        },
        {
          title: 'Enquiries Today',
          isTimeMoney: false,
          count: enquiriesToday,
          prevCount: prevEnquiriesToday,
        },
        {
          title: 'Enquiries This Week',
          isTimeMoney: false,
          count: enquiriesWeekToDate,
          prevCount: prevEnquiriesWeekToDate,
        },
        {
          title: 'Enquiries This Month',
          isTimeMoney: false,
          count: enquiriesMonthToDate,
          prevCount: prevEnquiriesMonthToDate,
        },
      ];
    }

    const currentWeekData = wipClioData.current_week?.daily_data[formattedToday];
    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(today.getDate() - 7);
    const formattedLastWeekDate = lastWeekDate.toISOString().split('T')[0];
    const lastWeekData = wipClioData.last_week?.daily_data[formattedLastWeekDate];

    return [
      {
        title: 'Time Today',
        isTimeMoney: true,
        money: currentWeekData ? currentWeekData.total_amount : 0,
        hours: currentWeekData ? currentWeekData.total_hours : 0,
        prevMoney: lastWeekData ? lastWeekData.total_amount : 0,
        prevHours: lastWeekData ? lastWeekData.total_hours : 0,
      },
      {
        title: 'Av. Time This Week',
        isTimeMoney: true,
        money: wipClioData.current_week.daily_average_amount,
        hours: wipClioData.current_week.daily_average_hours,
        prevMoney: wipClioData.last_week.daily_average_amount,
        prevHours: wipClioData.last_week.daily_average_hours,
      },
      {
        title: 'Fees Recovered This Month',
        isMoneyOnly: true,
        money: recoveredData ? recoveredData : '--',
        prevMoney: 0, // Assuming no previous data
      },
      {
        title: 'Enquiries Today',
        isTimeMoney: false,
        count: enquiriesToday,
        prevCount: prevEnquiriesToday,
      },
      {
        title: 'Enquiries This Week',
        isTimeMoney: false,
        count: enquiriesWeekToDate,
        prevCount: prevEnquiriesWeekToDate,
      },
      {
        title: 'Enquiries This Month',
        isTimeMoney: false,
        count: enquiriesMonthToDate,
        prevCount: prevEnquiriesMonthToDate,
      },
    ];
  }, [
    wipClioData,
    recoveredData,
    formattedToday,
    enquiriesToday,
    prevEnquiriesToday,
    enquiriesWeekToDate,
    prevEnquiriesWeekToDate,
    enquiriesMonthToDate,
    prevEnquiriesMonthToDate,
    today,
  ]);

  const officeAttendanceButtonStyles = currentUserConfirmed
    ? {
        root: {
          backgroundColor: `${colours.light.border} !important`,
          border: 'none !important',
          height: '40px !important',
          fontWeight: '600 !important',
          borderRadius: '4px !important',
          padding: '6px 12px !important',
          transition: 'background 0.3s ease !important',
        },
        rootHovered: {
          background: `radial-gradient(circle at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.15) 100%), ${colours.light.border} !important`,
        },
        rootPressed: {
          background: `radial-gradient(circle at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.25) 100%), ${colours.light.border} !important`,
        },
        rootFocused: {
          backgroundColor: `${colours.light.border} !important`,
        },
        label: {
          color: isDarkMode ? colours.dark.text : colours.light.text,
        },
      }
    : {
        root: {
          backgroundColor: `${colours.cta} !important`,
          border: 'none !important',
          height: '40px !important',
          fontWeight: '600 !important',
          borderRadius: '4px !important',
          padding: '6px 12px !important',
          animation: 'redPulse 2s infinite !important',
          transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
        },
        rootHovered: {
          background: `radial-gradient(circle at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.15) 100%), ${colours.cta} !important`,
        },
        rootPressed: {
          background: `radial-gradient(circle at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.25) 100%), ${colours.cta} !important`,
        },
        rootFocused: {
          backgroundColor: `${colours.cta} !important`,
        },
        label: {
          color: '#ffffff !important',
        },
      };

  const requestAnnualLeaveButtonStyles = {
    root: {
      backgroundColor: `${colours.light.border} !important`,
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600 !important',
      borderRadius: '4px !important',
      padding: '6px 12px !important',
      transition: 'transform 0.3s, box-shadow 0.3s',
    },
    rootHovered: {
      background: `radial-gradient(circle at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.15) 100%), ${colours.light.border} !important`,
    },
    rootPressed: {
      background: `radial-gradient(circle at center, rgba(0,0,0,0) 20%, rgba(0,0,0,0.25) 100%), ${colours.light.border} !important`,
    },
    rootFocused: {
      backgroundColor: `${colours.light.border} !important`,
    },
    label: {
      color: isDarkMode ? colours.dark.text : colours.light.text,
    },
  };

  const officeAttendanceIconProps = currentUserConfirmed
    ? { iconName: 'CheckMark', styles: { root: { color: '#00a300' } } }
    : { iconName: 'Warning', styles: { root: { color: '#ffffff' } } };

  return (
    <div className={containerStyle(isDarkMode)}>
      <Stack horizontal horizontalAlign="space-between" verticalAlign="center" className={headerStyle}>
        <Text className={greetingStyle(isDarkMode)}>{typedGreeting}</Text>
      </Stack>

      <Stack className={mainContentStyle} tokens={{ childrenGap: 40 }}>
        <div className={sectionRowStyle}>
          <div className={quickLinksStyle(isDarkMode)}>
            {quickActions.map((action: QuickLink, index: number) => {
              const delay = Math.floor(index / 3) * 0.2 + (index % 3) * 0.1;

              return (
                <QuickActionsCardStyled
                  key={action.title}
                  title={action.title}
                  icon={action.icon}
                  isDarkMode={isDarkMode}
                  onClick={() => handleActionClick(action)}
                  animationDelay={delay}
                />
              );
            })}
          </div>

          <div className={metricsContainerStyle(isDarkMode)}>
            {metricsData.map((metric: any, index: number) => (
              <div
                key={metric.title}
                style={{
                  gridColumn: `${(index % 3) + 1}`,
                  gridRow: `${Math.floor(index / 3) + 1}`,
                }}
              >
                <MetricCard
                  title={metric.title}
                  {...(
                    metric.isMoneyOnly
                      ? {
                          money: metric.money,
                          prevMoney: metric.prevMoney,
                          isMoneyOnly: metric.isMoneyOnly,
                        }
                      : metric.isTimeMoney
                      ? {
                          money: metric.money,
                          hours: metric.hours,
                          prevMoney: metric.prevMoney,
                          prevHours: metric.prevHours,
                          isTimeMoney: metric.isTimeMoney,
                        }
                      : {
                          count: metric.count,
                          prevCount: metric.prevCount,
                        }
                  )}
                  isDarkMode={isDarkMode}
                  animationDelay={Math.floor(index / 3) * 0.2 + (index % 3) * 0.1}
                />
              </div>
            ))}
          </div>
        </div>

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

          {formsFavorites.length > 0 && (
            <div>
              <div className={favouritesGridStyle}>
                {formsFavorites.map((form: FormItem, index: number) => (
                  <FormCard
                    key={`form-${form.title}`}
                    link={form}
                    isFavorite={true}
                    onCopy={(url: string, title: string) => copyToClipboardHandler(url, title)}
                    onSelect={() => setSelectedForm(form)}
                    onToggleFavorite={() => {
                      const updatedFavorites = formsFavorites.filter(
                        (fav) => fav.title !== form.title
                      );
                      setFormsFavorites(updatedFavorites);
                      localStorage.setItem(
                        'formsFavorites',
                        JSON.stringify(updatedFavorites)
                      );
                    }}
                    onGoTo={() => {
                      window.open(form.url, '_blank');
                    }}
                    animationDelay={index * 0.1}
                    description={form.description}
                  />
                ))}
              </div>
            </div>
          )}

          {resourcesFavorites.length > 0 && (
            <div>
              <div style={{ marginBottom: '15px' }}>
                <Text className={subLabelStyle(isDarkMode)}>Resources</Text>
              </div>
              <div className={favouritesGridStyle}>
                {resourcesFavorites.map((resource: Resource, index: number) => (
                  <ResourceCard
                    key={`resource-${resource.title}`}
                    resource={resource}
                    isFavorite={true}
                    onCopy={(url: string, title: string) => copyToClipboardHandler(url, title)}
                    onToggleFavorite={() => {
                      const updatedFavorites = resourcesFavorites.filter(
                        (fav) => fav.title !== resource.title
                      );
                      setResourcesFavorites(updatedFavorites);
                      localStorage.setItem(
                        'resourcesFavorites',
                        JSON.stringify(updatedFavorites)
                      );
                    }}
                    onGoTo={() => window.open(resource.url, '_blank')}
                    onSelect={() => setSelectedResource(resource)}
                    animationDelay={index * 0.1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={officeSectionRowStyle}>
          <div className={officeLeaveContainerStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 20 }}>
              <Stack
                horizontal
                verticalAlign="center"
                horizontalAlign="space-between"
                styles={{ root: { width: '100%' } }}
              >
                <Text className={sectionLabelStyle(isDarkMode)}>{officeSectionTitle}</Text>
                <DefaultButton
                  text={officeAttendanceButtonText}
                  onClick={() => setIsOfficeAttendancePanelOpen(true)}
                  iconProps={officeAttendanceIconProps}
                  styles={officeAttendanceButtonStyles}
                  ariaLabel={officeAttendanceButtonText}
                />
              </Stack>
              {isLoadingAttendance ? (
                <Spinner label="Loading attendance..." size={SpinnerSize.medium} />
              ) : attendanceError ? (
                <MessageBar messageBarType={MessageBarType.error}>{attendanceError}</MessageBar>
              ) : (
                <div className={peopleGridStyle}>
                  {allPeople.map((person: Person, index: number) => {
                    const row = Math.floor(index / columnsForPeople);
                    const col = index % columnsForPeople;
                    const delay = calculateAnimationDelay(row, col);
                    return (
                      <PersonBubble
                        key={index}
                        person={person}
                        isDarkMode={isDarkMode}
                        animationDelay={delay}
                      />
                    );
                  })}
                </div>
              )}
            </Stack>
          </div>

          <div className={verticalPipeStyle}></div>

          <div className={officeLeaveContainerStyle(isDarkMode)}>
            <Stack tokens={{ childrenGap: 20 }}>
              <Stack
                horizontal
                verticalAlign="center"
                horizontalAlign="space-between"
                styles={{ root: { width: '100%' } }}
              >
                <Text className={sectionLabelStyle(isDarkMode)}>Out or On Annual Leave Today</Text>
                <DefaultButton
                  text="Request Annual Leave"
                  onClick={() => setIsAnnualLeavePanelOpen(true)}
                  iconProps={{ iconName: 'Calendar' }}
                  styles={requestAnnualLeaveButtonStyles}
                  ariaLabel="Request Annual Leave"
                />
              </Stack>
              <div className={peopleGridStyle}></div>
            </Stack>
          </div>
        </div>
      </Stack>

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
          marginTop: '40px',
        })}
      >
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
              <Text style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                Teams Context
              </Text>
              <Text style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>|</Text>
              <Text style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>
                SQL Context
              </Text>
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
              <DetailsList
                items={transformContext(context)}
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
            </div>

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
              <DetailsList
                items={transformContext(userData)}
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
            </div>
          </Stack>
        )}
      </div>

      <div className={versionStyle}>Version 1.1</div>

      <Panel
        isOpen={isPanelOpen}
        onDismiss={() => setIsPanelOpen(false)}
        type={PanelType.medium}
        headerText={selectedAction ? selectedAction.title : ''}
        closeButtonAriaLabel="Close"
      >
        {selectedAction?.title === 'Create a Task' && <Tasking />}
        {selectedAction?.title === 'Create a Time Entry' && <CreateTimeEntryForm />}
        {selectedAction?.title === 'Save Attendance Note' && <TelephoneAttendance />}
        {selectedAction?.title === 'Save Telephone Note' && <TelephoneAttendance />}
        {selectedAction?.title === 'Create a Contact' && <RetrieveContactForm />}
        {selectedAction?.title === 'Retrieve a Contact' && <RetrieveContactForm />}
      </Panel>

      {selectedForm && (
        <FormDetails
          isOpen={true}
          onClose={() => setSelectedForm(null)}
          link={selectedForm}
          isDarkMode={isDarkMode}
        />
      )}

      {selectedResource && (
        <ResourceDetails resource={selectedResource} onClose={() => setSelectedResource(null)} />
      )}

      <HomePanel
        isOpen={isOfficeAttendancePanelOpen}
        onClose={() => setIsOfficeAttendancePanelOpen(false)}
        title={officeAttendanceForm.title}
        isDarkMode={isDarkMode}
        displayUrl={officeAttendanceForm.link}
        embedScript={{ key: 'QzaAr_2Q7kesClKq8g229g', formId: '109' }}
      />

      <HomePanel
        isOpen={isAnnualLeavePanelOpen}
        onClose={() => setIsAnnualLeavePanelOpen(false)}
        title={annualLeaveForm.title}
        isDarkMode={isDarkMode}
        bespokeFormFields={annualLeaveForm.fields}
        displayUrl={annualLeaveForm.link}
      />
    </div>
  );
};

export default Home;
