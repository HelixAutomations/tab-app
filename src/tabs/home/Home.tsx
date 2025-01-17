// src/tabs/home/Home.tsx

import React, { useState, useEffect, useMemo, ReactNode } from 'react';
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
  Persona,
  PersonaSize,
  PersonaPresence,
  DefaultButton,
  Icon,
  PrimaryButton,
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

import FormCard from '../forms/FormCard';
import ResourceCard from '../resources/ResourceCard';

import { FormItem } from '../forms/Forms';
import { Resource } from '../resources/Resources';

import FormDetails from '../forms/FormDetails';
import ResourceDetails from '../resources/ResourceDetails';

import HomePanel from './HomePanel';
import { Context as TeamsContextType } from '@microsoft/teams-js';

import BespokePanel from '../../app/functionality/BespokePanel';

import CreateTimeEntryForm from '../../CustomForms/CreateTimeEntryForm';
import AnnualLeaveForm from '../../CustomForms/AnnualLeaveForm';

// NEW: Import placeholders for approvals & bookings
import AnnualLeaveApprovals from '../../CustomForms/AnnualLeaveApprovals';
import AnnualLeaveBookings from '../../CustomForms/AnnualLeaveBookings';

initializeIcons();

interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  // If needed, add an id or unique identifier
  id?: string;
  // ...
}

interface HomeProps {
  context: TeamsContextType | null;
  userData: any;
  enquiries: any[] | null;
}

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
  { title: 'Request ID', icon: 'ContactInfo' },
  { title: 'Open a Matter', icon: 'FolderOpen' },
];

// Styles
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
  gridTemplateColumns: '2fr min-content 1fr',
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

// Flatten & Transform Context
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

// QuickActions Card
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
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
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
      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.2)',
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
    color: colours.highlight,
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

// Person Bubbles
const PersonBubble: React.FC<{ person: Person; isDarkMode: boolean; animationDelay?: number }> = ({
  person,
  isDarkMode,
  animationDelay,
}) => {
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

  if (person.presence === PersonaPresence.online) {
    return (
      <div className={bubbleStyle}>
        <div style={{ position: 'relative', zIndex: 4 }}>
          <Persona
            text=""
            imageUrl={HelixAvatar}
            size={PersonaSize.size40}
            presence={PersonaPresence.online}
            hidePersonaDetails
            styles={{ root: { zIndex: 4 } }}
          />
          <div className={textBubbleStyle}>
            <Text className={textStyle}>{person.nickname || person.name}</Text>
          </div>
        </div>
      </div>
    );
  } else if (person.presence === PersonaPresence.busy) {
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
          <Icon iconName="Airplane" styles={{ root: { color: colours.darkBlue, fontSize: 16 } }} />
        </div>
        <div className={textBubbleStyle}>
          <Text className={textStyle}>{person.nickname || person.name}</Text>
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

// Caching Variables
let cachedAttendance: any[] | null = null;
let cachedAttendanceError: string | null = null;
let cachedTeamData: any[] | null = null;

let cachedAnnualLeave: AnnualLeaveRecord[] | null = null;
let cachedAnnualLeaveError: string | null = null;

let cachedWipClio: any | null = null;
let cachedWipClioError: string | null = null;
let cachedRecovered: number | null = null;
let cachedRecoveredError: string | null = null;

// Updated CognitoForm for embedding Cognito forms
const CognitoForm: React.FC<{ dataKey: string; dataForm: string }> = ({ dataKey, dataForm }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';

      const script = document.createElement('script');
      script.src = 'https://www.cognitoforms.com/f/seamless.js';
      script.setAttribute('data-key', dataKey);
      script.setAttribute('data-form', dataForm);
      script.async = true;
      containerRef.current.appendChild(script);

      return () => {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
      };
    }
  }, [dataKey, dataForm]);

  return <div ref={containerRef} />;
};

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
  const [formsFavorites, setFormsFavorites] = useState<FormItem[]>([]);
  const [resourcesFavorites, setResourcesFavorites] = useState<Resource[]>([]);
  const [selectedForm, setSelectedForm] = useState<FormItem | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [isOfficeAttendancePanelOpen, setIsOfficeAttendancePanelOpen] = useState<boolean>(false);

  const [annualLeaveRecords, setAnnualLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [isLoadingAnnualLeave, setIsLoadingAnnualLeave] = useState<boolean>(true);
  const [annualLeaveError, setAnnualLeaveError] = useState<string | null>(null);
  const [futureLeaveRecords, setFutureLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [annualLeaveTotals, setAnnualLeaveTotals] = useState<{
    standard: number;
    unpaid: number;
    purchase: number;
  }>({
    standard: 0,
    unpaid: 0,
    purchase: 0,
  });

  const [wipClioData, setWipClioData] = useState<any>(null);
  const [wipClioError, setWipClioError] = useState<string | null>(null);
  const [recoveredData, setRecoveredData] = useState<number | null>(null);
  const [recoveredError, setRecoveredError] = useState<string | null>(null);
  const [isLoadingWipClio, setIsLoadingWipClio] = useState<boolean>(true);
  const [isLoadingRecovered, setIsLoadingRecovered] = useState<boolean>(true);

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

  const [isBespokePanelOpen, setIsBespokePanelOpen] = useState<boolean>(false);
  const [bespokePanelContent, setBespokePanelContent] = useState<ReactNode>(null);
  const [bespokePanelTitle, setBespokePanelTitle] = useState<string>('');

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
    if (cachedAttendance || cachedAttendanceError || cachedAnnualLeave || cachedAnnualLeaveError) {
      setAttendanceRecords(cachedAttendance || []);
      setTeamData(cachedTeamData || []);
      setAttendanceError(cachedAttendanceError);
      setAnnualLeaveRecords(cachedAnnualLeave || []);
      setAnnualLeaveError(cachedAnnualLeaveError);
      setIsLoadingAttendance(false);
      setIsLoadingAnnualLeave(false);
    } else {
      const fetchData = async () => {
        try {
          setIsLoadingAttendance(true);
          setIsLoadingAnnualLeave(true);

          const attendanceResponse = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_ATTENDANCE_PATH}?code=${process.env.REACT_APP_GET_ATTENDANCE_CODE}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }
          );

          if (!attendanceResponse.ok) throw new Error(`Failed to fetch attendance: ${attendanceResponse.status}`);
          const attendanceData = await attendanceResponse.json();

          cachedAttendance = attendanceData.attendance;
          cachedTeamData = attendanceData.team;
          setAttendanceRecords(attendanceData.attendance);
          setTeamData(attendanceData.team);
        } catch (error: any) {
          console.error('Error fetching attendance:', error);
          cachedAttendanceError = error.message || 'Unknown error occurred.';
          setAttendanceError(error.message || 'Unknown error occurred.');
          setAttendanceRecords([]);
          setTeamData([]);
        } finally {
          setIsLoadingAttendance(false);
        }

        try {
          const annualLeaveResponse = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_ANNUAL_LEAVE_PATH}?code=${process.env.REACT_APP_GET_ANNUAL_LEAVE_CODE}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                initials: userData[0]?.Initials || '',
              }),
            }
          );

          if (!annualLeaveResponse.ok) throw new Error(`Failed to fetch annual leave: ${annualLeaveResponse.status}`);
          const annualLeaveData = await annualLeaveResponse.json();

          if (annualLeaveData && Array.isArray(annualLeaveData.annual_leave)) {
            cachedAnnualLeave = annualLeaveData.annual_leave;
            setAnnualLeaveRecords(annualLeaveData.annual_leave);
            if (Array.isArray(annualLeaveData.future_leave)) {
              setFutureLeaveRecords(annualLeaveData.future_leave);
            }
            if (annualLeaveData.user_details && annualLeaveData.user_details.totals) {
              setAnnualLeaveTotals(annualLeaveData.user_details.totals);
            }
          } else {
            throw new Error('Invalid annual leave data format.');
          }
        } catch (error: any) {
          console.error('Error fetching annual leave:', error);
          cachedAnnualLeaveError = error.message || 'Unknown error occurred.';
          setAnnualLeaveError(error.message || 'Unknown error occurred.');
          setAnnualLeaveRecords([]);
        } finally {
          setIsLoadingAnnualLeave(false);
        }
      };

      fetchData();
    }
  }, [userData]);

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
          const clioID = parseInt(userData[0]['Clio ID'], 10);
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
    let content: ReactNode = <div>No form available.</div>;
    let titleText: string = action.title;

    switch (action.title) {
      case 'Create a Task':
        content = <Tasking />;
        break;
      case 'Save Telephone Note':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="38" />;
        break;
      case 'Save Attendance Note':
        content = <TelephoneAttendance />;
        break;
      case 'Open a Matter':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="9" />;
        break;
      case 'Create a Time Entry':
        content = <CreateTimeEntryForm />;
        break;
      case 'Request ID':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="60" />;
        break;
      default:
        content = <div>No form available.</div>;
        break;
    }

    setBespokePanelContent(content);
    setBespokePanelTitle(titleText);
    setIsBespokePanelOpen(true);
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

  const columnsForPeople = 3;
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

  const APPROVERS = ['AC', 'JW', 'LZ'];
  const userInitials = userData?.[0]?.Initials || '';
  const isApprover = APPROVERS.includes(userInitials);

  const approvalsNeeded = useMemo(
    () => (isApprover ? annualLeaveRecords.filter((x) => x.status === 'requested') : []),
    [annualLeaveRecords, isApprover]
  );
  const bookingsNeeded = useMemo(
    () =>
      annualLeaveRecords.filter(
        (x) =>
          (x.status === 'approved' || x.status === 'rejected') && x.person === userInitials
      ),
    [annualLeaveRecords, userInitials]
  );

  let manageLeaveLabel = 'Manage Annual Leave';
  let needsAttention = false;
  if (isApprover && approvalsNeeded.length > 0) {
    manageLeaveLabel = 'Approve Annual Leave';
    needsAttention = true;
  } else if (bookingsNeeded.length > 0) {
    manageLeaveLabel = 'Book Requested Leave';
    needsAttention = true;
  }
  const manageLeaveButtonStyles = needsAttention
    ? {
        root: {
          backgroundColor: `${colours.cta} !important`,
          animation: 'redPulse 2s infinite !important',
          border: 'none !important',
          height: '40px !important',
          fontWeight: '600 !important',
          borderRadius: '4px !important',
          padding: '6px 12px !important',
          transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
          color: '#ffffff !important',
        },
      }
    : {
        root: {
          backgroundColor: `${colours.light.border} !important`,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          border: 'none !important',
          height: '40px !important',
          fontWeight: '600 !important',
          borderRadius: '4px !important',
          padding: '6px 12px !important',
          transition: 'transform 0.3s, box-shadow 0.3s',
        },
      };

  const handleManageLeaveClick = () => {
    if (approvalsNeeded.length > 0 && bookingsNeeded.length > 0) {
      setBespokePanelContent(
        <Stack tokens={{ childrenGap: 30 }} style={{ padding: 20 }}>
          <Stack tokens={{ childrenGap: 10 }}>
            <Text variant="xLarge" styles={{ root: { fontWeight: 600 } }}>
              Approve Annual Leave
            </Text>
            <AnnualLeaveApprovals
              approvals={approvalsNeeded.map((item) => ({
                id: item.id || `temp-${item.start_date}-${item.end_date}`,
                person: item.person,
                start_date: item.start_date,
                end_date: item.end_date,
                reason: item.reason,
                status: item.status,
              }))}
              onClose={() => setIsBespokePanelOpen(false)}
              team={teamData}
              totals={annualLeaveTotals}
              holidayEntitlement={userData[0]?.holiday_entitlement || 0}
            />
          </Stack>
          <Stack tokens={{ childrenGap: 10 }}>
            <Text variant="xLarge" styles={{ root: { fontWeight: 600 } }}>
              Book Requested Leave
            </Text>
            <AnnualLeaveBookings
              bookings={bookingsNeeded.map((item) => ({
                id: item.id || `temp-${item.start_date}-${item.end_date}`,
                person: item.person,
                start_date: item.start_date,
                end_date: item.end_date,
                status: item.status,
              }))}
              onClose={() => setIsBespokePanelOpen(false)}
              team={teamData}
            />
          </Stack>
        </Stack>
      );
      setBespokePanelTitle('Manage Annual Leave');
    } else if (isApprover && approvalsNeeded.length > 0) {
      setBespokePanelContent(
        <AnnualLeaveApprovals
          approvals={approvalsNeeded.map((item) => ({
            id: item.id || `temp-${item.start_date}-${item.end_date}`,
            person: item.person,
            start_date: item.start_date,
            end_date: item.end_date,
            reason: item.reason,
            status: item.status,
          }))}
          onClose={() => setIsBespokePanelOpen(false)}
          team={teamData}
          totals={annualLeaveTotals}
          holidayEntitlement={userData[0]?.holiday_entitlement || 0}
        />
      );
      setBespokePanelTitle('Approve Annual Leave');
    } else if (bookingsNeeded.length > 0) {
      setBespokePanelContent(
        <AnnualLeaveBookings
          bookings={bookingsNeeded.map((item) => ({
            id: item.id || `temp-${item.start_date}-${item.end_date}`,
            person: item.person,
            start_date: item.start_date,
            end_date: item.end_date,
            status: item.status,
          }))}
          onClose={() => setIsBespokePanelOpen(false)}
          team={teamData}
        />
      );
      setBespokePanelTitle('Book Requested Leave');
    } else {
      setBespokePanelContent(<div style={{ padding: 20 }}>No items to action.</div>);
      setBespokePanelTitle('Manage Annual Leave');
    }
    setIsBespokePanelOpen(true);
  };

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
                      localStorage.setItem('formsFavorites', JSON.stringify(updatedFavorites));
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
                      localStorage.setItem('resourcesFavorites', JSON.stringify(updatedFavorites));
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
                  iconProps={
                    currentUserConfirmed
                      ? { iconName: 'CheckMark', styles: { root: { color: '#00a300' } } }
                      : { iconName: 'Warning', styles: { root: { color: '#ffffff' } } }
                  }
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
                <Stack horizontal tokens={{ childrenGap: 10 }}>
                  <DefaultButton
                    text="Request Annual Leave"
                    onClick={() => {
                      setBespokePanelContent(
                        <AnnualLeaveForm
                          futureLeave={futureLeaveRecords}
                          team={teamData}
                          userData={userData}
                          totals={annualLeaveTotals}
                        />
                      );
                      setBespokePanelTitle('Request Annual Leave');
                      setIsBespokePanelOpen(true);
                    }}
                    iconProps={{ iconName: 'Calendar' }}
                    styles={{
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
                    }}
                    ariaLabel="Request Annual Leave"
                  />

                  <DefaultButton
                    text={manageLeaveLabel}
                    onClick={handleManageLeaveClick}
                    styles={manageLeaveButtonStyles}
                  />
                </Stack>
              </Stack>
              {isLoadingAnnualLeave ? (
                <Spinner label="Loading annual leave..." size={SpinnerSize.medium} />
              ) : annualLeaveError ? (
                <MessageBar messageBarType={MessageBarType.error}>{annualLeaveError}</MessageBar>
              ) : (
                <div className={peopleGridStyle}>
                  {annualLeaveRecords.map((leave, index: number) => {
                    const teamMember = teamData.find(
                      (member) => member.Initials.toLowerCase() === leave.person.toLowerCase()
                    );
                    return (
                      <PersonBubble
                        key={`leave-${index}`}
                        person={{
                          name: leave.person,
                          initials: teamMember ? teamMember.Initials : '',
                          presence: PersonaPresence.busy,
                          nickname: teamMember ? teamMember.Nickname : leave.person,
                        }}
                        isDarkMode={isDarkMode}
                        animationDelay={calculateAnimationDelay(
                          Math.floor(index / columnsForPeople),
                          index % columnsForPeople
                        )}
                      />
                    );
                  })}
                </div>
              )}
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
            alignItems: 'flex-start',
            marginBottom: '15px',
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

      <BespokePanel
        isOpen={isBespokePanelOpen}
        onClose={() => setIsBespokePanelOpen(false)}
        title={bespokePanelTitle}
        width="1000px"
      >
        {bespokePanelContent}
      </BespokePanel>

      {selectedForm && (
        <FormDetails
          isOpen={true}
          onClose={() => setSelectedForm(null)}
          link={selectedForm}
          isDarkMode={isDarkMode}
          userData={userData}
        />
      )}

      {selectedResource && (
        <ResourceDetails resource={selectedResource} onClose={() => setSelectedResource(null)} />
      )}

      <HomePanel
        isOpen={isOfficeAttendancePanelOpen}
        onClose={() => setIsOfficeAttendancePanelOpen(false)}
        title="Office Attendance"
        isDarkMode={isDarkMode}
        displayUrl=""
        embedScript={{ key: 'QzaAr_2Q7kesClKq8g229g', formId: '109' }}
      />
    </div>
  );
};

export default Home;
