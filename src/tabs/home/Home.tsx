// src/tabs/home/Home.tsx

import React, {
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useRef, // ADDED
} from 'react';
import {
  mergeStyles,
  Text,
  Spinner,
  SpinnerSize,
  MessageBar,
  MessageBarType,
  IconButton,
  Stack,
  DetailsList,
  IColumn,
  DetailsListLayoutMode,
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
import InAttendanceImg from '../../assets/in_attendance.png';
import WfhImg from '../../assets/wfh.png';
import OutImg from '../../assets/outv2.png';
import '../../app/styles/VerticalLabelPanel.css';
import { useTheme } from '../../app/functionality/ThemeContext';
import '../../app/styles/MetricCard.css';

import Tasking from '../../CustomForms/Tasking';
import TelephoneAttendance from '../../CustomForms/TelephoneAttendance';

import FormCard from '../forms/FormCard';
import ResourceCard from '../resources/ResourceCard';

import { FormItem, Matter } from '../../app/functionality/types';
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

import ActionSection from './ActionSection';
import { sharedDefaultButtonStyles } from '../../app/styles/ButtonStyles';

// NEW: Import the updated QuickActionsCard component
import QuickActionsCard from './QuickActionsCard';

initializeIcons();

//////////////////////
// Interfaces
//////////////////////

interface AnnualLeaveRecord {
  person: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  id: string;
  rejection_notes?: string;
  approvers?: string[];
}

interface HomeProps {
  context: TeamsContextType | null;
  userData: any;
  enquiries: any[] | null;
  onAllMattersFetched?: (matters: Matter[]) => void;
}

interface QuickLink {
  title: string;
  icon: string;
}

interface Person {
  id: string;
  name: string;
  initials: string;
  presence: PersonaPresence;
  nickname?: string;
}

interface CollapsibleSectionProps {
  title: string;
  metrics: { title: string }[];
  children: React.ReactNode;
}

interface CollapsibleSectionProps {
  title: string;
  metrics: { title: string }[];
  children: React.ReactNode;
}

interface CollapsibleSectionProps {
  title: string;
  metrics: { title: string }[];
  children: React.ReactNode;
}

interface CollapsibleSectionProps {
  title: string;
  metrics: { title: string }[];
  children: React.ReactNode;
}

interface CollapsibleSectionProps {
  title: string;
  metrics: { title: string }[];
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, metrics, children }) => {
  // Start expanded by default
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapse = () => setCollapsed(!collapsed);

  // Build the metric labels string (only used when collapsed)
  const metricLabels = metrics.map(m => m.title).join(' | ');

  return (
    // Outer container with a drop shadow and rounded corners
    <div
      style={{
        marginBottom: '20px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        borderRadius: '4px',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div 
        onClick={toggleCollapse} 
        style={{
          backgroundColor: colours.darkBlue,
          color: '#ffffff',
          padding: '10px 15px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {title}
          {collapsed && metrics.length > 0 && (
            <span style={{ marginLeft: '10px' }}>{metricLabels}</span>
          )}
        </span>
        <span>{collapsed ? '▼' : '▲'}</span>
      </div>
      {/* Content */}
      {!collapsed && (
        <div 
          style={{
            padding: '10px 15px',
            backgroundColor: colours.light.sectionBackground
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};


//////////////////////
// Quick Actions Order
//////////////////////

const quickActionOrder: Record<string, number> = {
  'Confirm Attendance': 1,
  'Create a Task': 2,
  'Request CollabSpace': 3,
  'Save Telephone Note': 4,
  'Save Attendance Note': 5,
  'Request ID': 6,
  'Open a Matter': 7,
  'Request Annual Leave': 8,
};

//////////////////////
// Quick Actions
//////////////////////

const quickActions: QuickLink[] = [
  { title: 'Confirm Attendance', icon: 'Accept' },
  { title: 'Create a Task', icon: 'Checklist' },
  { title: 'Request CollabSpace', icon: 'Group' },
  { title: 'Save Telephone Note', icon: 'Comment' },
  { title: 'Save Attendance Note', icon: 'NotePinned' },
  { title: 'Request ID', icon: 'ContactInfo' },
  { title: 'Open a Matter', icon: 'FolderOpen' },
  { title: 'Request Annual Leave', icon: 'Calendar' },
];

//////////////////////
// Styles
//////////////////////

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
  alignItems: 'flex-start',
  width: '100%',
  padding: '10px 0',
  gap: '20px',
});

const greetingStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '32px',
    whiteSpace: 'nowrap',
    color: isDarkMode ? colours.dark.text : colours.light.text,
  });

const reviewMessageStyle = (isDarkMode: boolean) =>
  mergeStyles({
    fontWeight: '600',
    fontSize: '24px',
    color: isDarkMode ? colours.cta : colours.cta,
    display: 'flex',
    alignItems: 'center',
  });

const mainContentStyle = mergeStyles({
  display: 'flex',
  flexDirection: 'column',
});

const quickLinksStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '10px',
    borderRadius: '8px',
    boxShadow: isDarkMode
      ? `0 2px 4px ${colours.dark.border}`
      : `0 2px 4px ${colours.light.border}`,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    display: 'flex',
    flexDirection: 'row',
    gap: '10px',
    overflowX: 'auto',
    alignItems: 'center',
    marginBottom: '20px',
  });

const tableAnimationStyle = mergeStyles({
  animation: 'fadeIn 0.5s ease-in-out',
});

const calculateAnimationDelay = (row: number, col: number) => (row + col) * 0.1;

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
  '@media (min-width: 1000px)': { gridTemplateColumns: 'repeat(5, 1fr)' },
});

const peopleGridStyle = mergeStyles({
  display: 'grid',
  paddingLeft: '80px',
  gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
  gap: '20px',
  alignItems: 'center',
  width: '100%',
});

const sectionContainerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
    padding: '20px 20px 20px 20px',
    borderRadius: '12px',
    boxShadow: isDarkMode
      ? `0 4px 12px ${colours.dark.border}`
      : `0 4px 12px ${colours.light.border}`,
    position: 'relative',
    width: '100%',
  });

const fadeInAnimationStyle = mergeStyles({
  animation: 'fadeIn 0.5s ease-in-out',
});

//////////////////////
// TabLabel Component
//////////////////////
const TabLabel: React.FC<{ label: string }> = ({ label }) => {
  return (
    <div
      className={mergeStyles({
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: '50px',
        backgroundColor: colours.grey,
        zIndex: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <span style={{ transform: 'rotate(-90deg)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
};

//////////////////////
// Utility: Flatten & Transform Context
//////////////////////

const flattenObject = (obj: any, prefix = ''): { key: string; value: any }[] => {
  let result: { key: string; value: any }[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v))
      result = result.concat(flattenObject(v, newKey));
    else result.push({ key: newKey, value: v });
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
    styles: { root: { color: isDarkMode ? colours.dark.text : colours.light.text } },
  },
  {
    key: 'value',
    name: 'Value',
    fieldName: 'value',
    minWidth: 300,
    maxWidth: 600,
    isResizable: true,
    styles: { root: { color: isDarkMode ? colours.dark.text : colours.light.text } },
  },
];

//////////////////////
// PersonBubble Component
//////////////////////

interface PersonBubbleProps {
  person: Person;
  isDarkMode: boolean;
  animationDelay?: number;
  avatarUrlOverride?: string;
}

const PersonBubble: React.FC<PersonBubbleProps> = ({
  person,
  isDarkMode,
  animationDelay,
  avatarUrlOverride,
}) => {
  const bubbleStyle = mergeStyles({
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    opacity: 0,
    transform: 'translateY(20px)',
    animation: `fadeInUp 0.3s ease forwards`,
    animationDelay: animationDelay ? `${animationDelay}s` : '0s',
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

  let imageUrl = WfhImg;
  let presence = PersonaPresence.none;

  if (person.presence === PersonaPresence.online) {
    imageUrl = InAttendanceImg;
    presence = PersonaPresence.online;
  } else if (person.presence === PersonaPresence.busy) {
    imageUrl = OutImg;
    presence = PersonaPresence.busy;
  }

  return (
    <div className={bubbleStyle}>
      <div style={{ position: 'relative', zIndex: 4 }}>
        <Persona
          text=""
          imageUrl={avatarUrlOverride || imageUrl}
          size={PersonaSize.size40}
          presence={presence}
          hidePersonaDetails
          styles={{
            root: {
              zIndex: 4,
              boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.15)',
              borderRadius: '50%',
            },
          }}
        />
        <div className={textBubbleStyle}>
          <Text className={textStyle}>{person.nickname || person.name}</Text>
        </div>
      </div>
    </div>
  );
};

//////////////////////
// Caching Variables (module-level)
//////////////////////

let cachedAttendance: any[] | null = null;
let cachedAttendanceError: string | null = null;
let cachedTeamData: any[] | null = null;

let cachedAnnualLeave: AnnualLeaveRecord[] | null = null;
let cachedAnnualLeaveError: string | null = null;

// ADDED: store future leave in module-level cache so we can restore on remount
let cachedFutureLeaveRecords: AnnualLeaveRecord[] | null = null; // ADDED

let cachedWipClio: any | null = null;
let cachedWipClioError: string | null = null;
let cachedRecovered: number | null = null;
let cachedRecoveredError: string | null = null;

let cachedAllMatters: Matter[] | null = null;
let cachedAllMattersError: string | null = null;

//////////////////////
// Helper: Ensure "LZ" is in Approvers
//////////////////////

const ensureLZInApprovers = (approvers: string[] = []): string[] => {
  return approvers.includes('LZ') ? approvers : [...approvers, 'LZ'];
};

//////////////////////
// CognitoForm Component
//////////////////////

const CognitoForm: React.FC<{ dataKey: string; dataForm: string }> = ({ dataKey, dataForm }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://www.cognitoforms.com/f/seamless.js';
      script.setAttribute('data-key', dataKey);
      script.setAttribute('data-form', dataForm);
      script.async = true;
      containerRef.current.appendChild(script);
      return () => {
        if (containerRef.current) containerRef.current.innerHTML = '';
      };
    }
  }, [dataKey, dataForm]);
  return <div ref={containerRef} />;
};

//////////////////////
// Home Component
//////////////////////

const Home: React.FC<HomeProps> = ({ context, userData, enquiries, onAllMattersFetched }) => {
  const { isDarkMode } = useTheme();

  const renderContextsPanelContent = () => (
    <Stack tokens={{ childrenGap: 30 }} style={{ padding: 20 }}>
      <Stack tokens={{ childrenGap: 10 }}>
        <Text variant="xLarge" styles={{ root: { fontWeight: '600' } }}>
          Teams Context
        </Text>
        <DetailsList
          items={transformContext(context)}
          columns={createColumnsFunction(isDarkMode)}
          setKey="teamsSet"
          layoutMode={DetailsListLayoutMode.justified}
          isHeaderVisible={false}
          styles={{
            root: {
              selectors: {
                '.ms-DetailsRow': { padding: '8px 0', borderBottom: 'none' },
                '.ms-DetailsHeader': { display: 'none' },
              },
            },
          }}
        />
      </Stack>
      <Stack tokens={{ childrenGap: 10 }}>
        <Text variant="xLarge" styles={{ root: { fontWeight: '600' } }}>
          SQL Context
        </Text>
        <DetailsList
          items={transformContext(userData)}
          columns={createColumnsFunction(isDarkMode)}
          setKey="sqlSet"
          layoutMode={DetailsListLayoutMode.justified}
          isHeaderVisible={false}
          styles={{
            root: {
              selectors: {
                '.ms-DetailsRow': { padding: '8px 0', borderBottom: 'none' },
                '.ms-DetailsHeader': { display: 'none' },
              },
            },
          }}
        />
      </Stack>
    </Stack>
  );

  // ADDED: Store user initials so they don't reset on remount
  const storedUserInitials = useRef<string | null>(null); // ADDED

  // State declarations...
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
  const [isBespokePanelOpen, setIsBespokePanelOpen] = useState<boolean>(false);
  const [bespokePanelContent, setBespokePanelContent] = useState<ReactNode>(null);
  const [bespokePanelTitle, setBespokePanelTitle] = useState<string>('');
  const [isContextPanelOpen, setIsContextPanelOpen] = useState<boolean>(false);
  const [bankHolidays, setBankHolidays] = useState<Set<string>>(new Set());

  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [teamData, setTeamData] = useState<any[]>([]);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [annualLeaveRecords, setAnnualLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [annualLeaveError, setAnnualLeaveError] = useState<string | null>(null);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(false);
  const [isLoadingAnnualLeave, setIsLoadingAnnualLeave] = useState<boolean>(false);
  const [wipClioData, setWipClioData] = useState<any | null>(null);
  const [wipClioError, setWipClioError] = useState<string | null>(null);
  const [recoveredData, setRecoveredData] = useState<number | null>(null);
  const [recoveredError, setRecoveredError] = useState<string | null>(null);
  const [isLoadingWipClio, setIsLoadingWipClio] = useState<boolean>(false);
  const [isLoadingRecovered, setIsLoadingRecovered] = useState<boolean>(false);
  const [futureLeaveRecords, setFutureLeaveRecords] = useState<AnnualLeaveRecord[]>([]);
  const [annualLeaveTotals, setAnnualLeaveTotals] = useState<any>(null);
  const [isActionsLoading, setIsActionsLoading] = useState<boolean>(true);

  const [allMatters, setAllMatters] = useState<Matter[] | null>(null);
  const [allMattersError, setAllMattersError] = useState<string | null>(null);
  const [isLoadingAllMatters, setIsLoadingAllMatters] = useState<boolean>(false);

  const [timeMetricsCollapsed, setTimeMetricsCollapsed] = useState(false);
  const [conversionMetricsCollapsed, setConversionMetricsCollapsed] = useState(false);

  // ADDED: userInitials logic - store in ref so it doesn't reset on re-render.
  const rawUserInitials = userData?.[0]?.Initials || '';
  useEffect(() => {
    if (rawUserInitials) {
      storedUserInitials.current = rawUserInitials;
    }
  }, [rawUserInitials]);
  // Now anywhere we used userInitials, we can do:
  const userInitials = storedUserInitials.current || rawUserInitials;

  useEffect(() => {
    const fetchBankHolidays = async () => {
      try {
        const response = await fetch('https://www.gov.uk/bank-holidays.json');
        if (!response.ok) {
          throw new Error(`Failed to fetch bank holidays: ${response.status}`);
        }
        const data = await response.json();
        const currentYear = new Date().getFullYear();
        const englandAndWalesEvents = data['england-and-wales'].events || [];
        const holidaysThisYear = englandAndWalesEvents
          .filter((event: { date: string }) => new Date(event.date).getFullYear() === currentYear)
          .map((event: { date: string }) => event.date);
        setBankHolidays(new Set(holidaysThisYear));
      } catch (error) {
        console.error('Error fetching bank holidays:', error);
      }
    };
    fetchBankHolidays();
  }, []);

  useEffect(() => {
    const storedFormsFavorites = localStorage.getItem('formsFavorites');
    const storedResourcesFavorites = localStorage.getItem('resourcesFavorites');
    if (storedFormsFavorites) {
      setFormsFavorites(JSON.parse(storedFormsFavorites));
    }
    if (storedResourcesFavorites) {
      setResourcesFavorites(JSON.parse(storedResourcesFavorites));
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
    if (
      userData &&
      Array.isArray(userData) &&
      userData.length > 0 &&
      (userData[0].First || userData[0].First_Name)
    ) {
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
    if (enquiries && currentUserEmail) {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const todayCount = enquiries.filter((enquiry: any) => {
        if (!enquiry.Touchpoint_Date) return false;
        const enquiryDate = new Date(enquiry.Touchpoint_Date);
        return (
          enquiryDate.toDateString() === today.toDateString() &&
          enquiry.Point_of_Contact === currentUserEmail
        );
      }).length;
      const weekToDateCount = enquiries.filter((enquiry: any) => {
        if (!enquiry.Touchpoint_Date) return false;
        const enquiryDate = new Date(enquiry.Touchpoint_Date);
        return (
          enquiryDate >= startOfWeek &&
          enquiryDate <= today &&
          enquiry.Point_of_Contact === currentUserEmail
        );
      }).length;
      const monthToDateCount = enquiries.filter((enquiry: any) => {
        if (!enquiry.Touchpoint_Date) return false;
        const enquiryDate = new Date(enquiry.Touchpoint_Date);
        return (
          enquiryDate >= startOfMonth &&
          enquiryDate <= today &&
          enquiry.Point_of_Contact === currentUserEmail
        );
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
    // ADDED: Restore from cache immediately
    if (cachedAttendance || cachedAttendanceError || cachedAnnualLeave || cachedAnnualLeaveError) {
      // If data is cached, restore it straight away
      setAttendanceRecords(cachedAttendance || []);
      setTeamData(cachedTeamData || []);
      setAttendanceError(cachedAttendanceError);

      setAnnualLeaveRecords(cachedAnnualLeave || []);
      // ADDED: Also restore future leave if cached
      setFutureLeaveRecords(cachedFutureLeaveRecords || []); // ADDED
      setAnnualLeaveError(cachedAnnualLeaveError);

      setIsLoadingAttendance(false);
      setIsLoadingAnnualLeave(false);
      setIsActionsLoading(false);
    } else {
      const fetchData = async () => {
        try {
          setIsLoadingAttendance(true);
          setIsLoadingAnnualLeave(true);
          const attendanceResponse = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_ATTENDANCE_PATH}?code=${process.env.REACT_APP_GET_ATTENDANCE_CODE}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' } }
          );
          if (!attendanceResponse.ok)
            throw new Error(`Failed to fetch attendance: ${attendanceResponse.status}`);
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
              body: JSON.stringify({ initials: userData[0]?.Initials || '' }),
            }
          );
          if (!annualLeaveResponse.ok)
            throw new Error(`Failed to fetch annual leave: ${annualLeaveResponse.status}`);
          const annualLeaveData = await annualLeaveResponse.json();
          if (annualLeaveData && Array.isArray(annualLeaveData.annual_leave)) {
            const mappedAnnualLeave: AnnualLeaveRecord[] = annualLeaveData.annual_leave.map(
              (rec: any) => ({
                person: rec.person,
                start_date: rec.start_date,
                end_date: rec.end_date,
                reason: rec.reason,
                status: rec.status,
                id: rec.request_id
                  ? String(rec.request_id)
                  : rec.id || `temp-${rec.start_date}-${rec.end_date}`,
                rejection_notes: rec.rejection_notes || undefined,
                approvers: ensureLZInApprovers(rec.approvers),
              })
            );
            cachedAnnualLeave = mappedAnnualLeave;
            setAnnualLeaveRecords(mappedAnnualLeave);

            if (Array.isArray(annualLeaveData.future_leave)) {
              const mappedFutureLeave: AnnualLeaveRecord[] = annualLeaveData.future_leave.map(
                (rec: any) => ({
                  person: rec.person,
                  start_date: rec.start_date,
                  end_date: rec.end_date,
                  reason: rec.reason,
                  status: rec.status,
                  id: rec.request_id
                    ? String(rec.request_id)
                    : rec.id || `temp-${rec.start_date}-${rec.end_date}`,
                  rejection_notes: rec.rejection_notes || undefined,
                  approvers: ensureLZInApprovers(rec.approvers),
                })
              );
              cachedFutureLeaveRecords = mappedFutureLeave; // ADDED
              setFutureLeaveRecords(mappedFutureLeave);
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
          setIsActionsLoading(false);
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
          if (!wipResponse.ok)
            throw new Error(`Failed to fetch WIP Clio: ${wipResponse.status}`);
          const wipData = await wipResponse.json();
          cachedWipClio = wipData;
          setWipClioData(wipData);
          if (!recoveredResponse.ok)
            throw new Error(`Failed to fetch Recovered: ${recoveredResponse.status}`);
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

  useEffect(() => {
    if (cachedAllMatters || cachedAllMattersError) {
      setAllMatters(cachedAllMatters || []);
      setAllMattersError(cachedAllMattersError);
      setIsLoadingAllMatters(false);
    } else {
      const fetchAllMattersData = async () => {
        try {
          setIsLoadingAllMatters(true);
          const response = await fetch(
            `${process.env.REACT_APP_PROXY_BASE_URL}/${process.env.REACT_APP_GET_ALL_MATTERS_PATH}?code=${process.env.REACT_APP_GET_ALL_MATTERS_CODE}`,
            { method: 'GET' }
          );
          if (!response.ok) {
            throw new Error(`Failed to fetch all matters: ${response.status}`);
          }
          const rawData = await response.json();
          const mapData = (items: any[]): Matter[] => {
            return items.map((item) => ({
              DisplayNumber: item['Display Number'] || '',
              OpenDate: item['Open Date'] || '',
              MonthYear: item['MonthYear'] || '',
              YearMonthNumeric: item['YearMonthNumeric'] || 0,
              ClientID: item['Client ID'] || '',
              ClientName: item['Client Name'] || '',
              ClientPhone: item['Client Phone'] || '',
              ClientEmail: item['Client Email'] || '',
              Status: item['Status'] || '',
              UniqueID: item['Unique ID'] || '',
              Description: item['Description'] || '',
              PracticeArea: item['Practice Area'] || '',
              Source: item['Source'] || '',
              Referrer: item['Referrer'] || '',
              ResponsibleSolicitor: item['Responsible Solicitor'] || '',
              OriginatingSolicitor: item['Originating Solicitor'] || '',
              SupervisingPartner: item['Supervising Partner'] || '',
              Opponent: item['Opponent'] || '',
              OpponentSolicitor: item['Opponent Solicitor'] || '',
              CloseDate: item['Close Date'] || '',
              ApproxValue: item['Approx. Value'] || '',
              mod_stamp: item['mod_stamp'] || '',
              method_of_contact: item['method_of_contact'] || '',
              CCL_date: item['CCL_date'] || null,
              Rating: item['Rating'] as 'Good' | 'Neutral' | 'Poor' | undefined,
            }));
          };

          let mappedMatters: Matter[] = [];
          if (Array.isArray(rawData)) {
            mappedMatters = mapData(rawData);
          } else {
            if (Array.isArray(rawData.matters)) {
              mappedMatters = mapData(rawData.matters);
            } else {
              console.warn('Unexpected data format for getAllMatters:', rawData);
            }
          }

          cachedAllMatters = mappedMatters;
          setAllMatters(mappedMatters);
          if (onAllMattersFetched) {
            onAllMattersFetched(mappedMatters);
          }
        } catch (error: any) {
          console.error('Error fetching all matters:', error);
          cachedAllMattersError = error.message;
          setAllMattersError(error.message);
          setAllMatters([]);
        } finally {
          setIsLoadingAllMatters(false);
        }
      };
      fetchAllMattersData();
    }
  }, [onAllMattersFetched]);

  const columns = useMemo(() => createColumnsFunction(isDarkMode), [isDarkMode]);

// --- Updated Confirm Attendance snippet ---

// 1. Grab user’s initials from userData (Now done via rawUserInitials + storedUserInitials above)
const matchingTeamMember = teamData.find(
  (member: any) => (member.Initials || '').toLowerCase() === userInitials.toLowerCase()
);

const attendanceName = matchingTeamMember ? matchingTeamMember.First : '';

const currentUserRecord = attendanceRecords.find(
  (record: any) => (record.name || '').toLowerCase() === attendanceName.toLowerCase()
);

const currentUserConfirmed = !!(
  currentUserRecord &&
  Object.values(currentUserRecord.weeks || {}).some(
    (week: any) => (week.attendance || '').trim() !== ''
  )
);

const officeAttendanceButtonText = currentUserConfirmed
  ? 'Update Attendance'
  : 'Confirm Attendance';

  const today = new Date();
  const formattedToday = today.toISOString().split('T')[0];
  const columnsForPeople = 3;

  const isPersonOutToday = (person: Person): boolean => {
    const todayStr = new Date().toISOString().split('T')[0];
    return annualLeaveRecords.some((leave) => {
      if (leave.status !== 'booked') return false;
      if (leave.person.trim().toLowerCase() !== person.initials.trim().toLowerCase()) return false;
      return todayStr >= leave.start_date && todayStr <= leave.end_date;
    });
  };

  const allPeople = useMemo(() => {
    if (!teamData || teamData.length === 0) return [];
    return teamData
      .sort((a: any, b: any) => a.First.localeCompare(b.First))
      .map((t: any) => {
        const att = attendanceRecords.find(
          (a: any) => a.name.toLowerCase() === t.First.toLowerCase()
        );
        const attending = att ? att.attendingToday : false;
        return {
          id: t.Initials,
          name: t.First,
          initials: t.Initials,
          presence: attending ? PersonaPresence.online : PersonaPresence.none,
          nickname: t.Nickname || t.First,
        };
      });
  }, [teamData, attendanceRecords]);

  const metricsData = useMemo(() => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    const userFullName =
      userData?.[0]?.FullName ||
      `${userData?.[0]?.First || ''} ${userData?.[0]?.Last || ''}`.trim();
    const mattersOpenedCount = allMatters
      ? allMatters.filter((m) => {
          const openDate = new Date(m.OpenDate);
          return (
            openDate.getMonth() === currentMonth &&
            openDate.getFullYear() === currentYear &&
            m.OriginatingSolicitor.toLowerCase() === userFullName.toLowerCase()
          );
        }).length
      : 0;

    if (!wipClioData) {
      return [
        { title: 'Time Today', isTimeMoney: true, money: 0, hours: 0, prevMoney: 0, prevHours: 0, showDial: true, dialTarget: 6 },
        { title: 'Av. Time This Week', isTimeMoney: true, money: 0, hours: 0, prevMoney: 0, prevHours: 0, showDial: true, dialTarget: 6 },
        { title: 'Time This Week', isTimeMoney: true, money: 0, hours: 0, prevMoney: 0, prevHours: 0, showDial: true, dialTarget: 30 },
        { title: 'Fees Recovered This Month', isMoneyOnly: true, money: 0, prevMoney: 0 },
        { title: 'Enquiries Today', isTimeMoney: false, count: enquiriesToday, prevCount: prevEnquiriesToday },
        { title: 'Enquiries This Week', isTimeMoney: false, count: enquiriesWeekToDate, prevCount: prevEnquiriesWeekToDate },
        { title: 'Enquiries This Month', isTimeMoney: false, count: enquiriesMonthToDate, prevCount: prevEnquiriesMonthToDate },
        { title: 'Matters Opened', isTimeMoney: false, count: mattersOpenedCount, prevCount: 0 },
      ];
    }
    const currentWeekData = wipClioData.current_week?.daily_data[formattedToday];
    const lastWeekDate = new Date(today);
    lastWeekDate.setDate(today.getDate() - 7);
    const formattedLastWeekDate = lastWeekDate.toISOString().split('T')[0];
    const lastWeekData = wipClioData.last_week?.daily_data[formattedLastWeekDate];

    let totalTimeThisWeek = 0;
    if (wipClioData.current_week && wipClioData.current_week.daily_data) {
      Object.values(wipClioData.current_week.daily_data).forEach((dayData: any) => {
        totalTimeThisWeek += dayData.total_hours || 0;
      });
    }

    const getWorkWeekDays = (): Date[] => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diff);
      const days: Date[] = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
      }
      return days;
    };
    const workWeekDays = getWorkWeekDays();
    let leaveDays = 0;
    workWeekDays.forEach((day) => {
      const dayString = day.toISOString().split('T')[0];
      if (
        annualLeaveRecords.some(
          (rec) =>
            rec.status === 'booked' &&
            rec.person.toLowerCase() === userInitials.toLowerCase() &&
            dayString >= rec.start_date &&
            dayString <= rec.end_date
        )
      ) {
        leaveDays++;
      }
    });
    const adjustedTarget = (5 - leaveDays) * 6;

    return [
      {
        title: 'Time Today',
        isTimeMoney: true,
        money: currentWeekData ? currentWeekData.total_amount : 0,
        hours: currentWeekData ? currentWeekData.total_hours : 0,
        prevMoney: lastWeekData ? lastWeekData.total_amount : 0,
        prevHours: lastWeekData ? lastWeekData.total_hours : 0,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Av. Time This Week',
        isTimeMoney: true,
        money: wipClioData.current_week.daily_average_amount,
        hours: wipClioData.current_week.daily_average_hours,
        prevMoney: wipClioData.last_week.daily_average_amount,
        prevHours: wipClioData.last_week.daily_average_hours,
        showDial: true,
        dialTarget: 6,
      },
      {
        title: 'Time This Week',
        isTimeMoney: true,
        money: 0,
        hours: totalTimeThisWeek,
        prevMoney: 0,
        prevHours: 0,
        showDial: true,
        dialTarget: adjustedTarget,
      },
      {
        title: 'Fees Recovered This Month',
        isMoneyOnly: true,
        money: recoveredData ? recoveredData : 0,
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
      {
        title: 'Matters Opened',
        isTimeMoney: false,
        count: mattersOpenedCount,
        prevCount: 0,
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
    annualLeaveRecords,
    userData,
    allMatters,
    userInitials, // ADDED so we recalc if userInitials changes
  ]);
  const timeMetrics = metricsData.slice(0, 4);
  const enquiryMetrics = metricsData.slice(4);

  // Combine annualLeaveRecords and futureLeaveRecords for approval filtering
  const combinedLeaveRecords = useMemo(() => {
    return [...annualLeaveRecords, ...futureLeaveRecords];
  }, [annualLeaveRecords, futureLeaveRecords]);

  const APPROVERS = ['AC', 'JW', 'LZ'];
  // MODIFIED: using userInitials from the ref
  const isApprover = APPROVERS.includes(userInitials);

  const approvalsNeeded = useMemo(
    () =>
      isApprover
        ? combinedLeaveRecords.filter(
            (x) => x.status === 'requested' && x.approvers?.includes(userInitials)
          )
        : [],
    [combinedLeaveRecords, isApprover, userInitials]
  );

  // Merge annualLeaveRecords and futureLeaveRecords for bookings
  const bookingsNeeded = useMemo(
    () =>
      [...annualLeaveRecords, ...futureLeaveRecords].filter(
        (x) =>
          (x.status === 'approved' || x.status === 'rejected') &&
          x.person.toLowerCase() === userInitials.toLowerCase()
      ),
    [annualLeaveRecords, futureLeaveRecords, userInitials]
  );

  useEffect(() => {
    console.log('Approvals Needed:', approvalsNeeded);
  }, [approvalsNeeded]);

  // Quick action button styles
  const approveButtonStyles = {
    root: {
      backgroundColor: '#FFD700 !important', // Yellow background
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600',
      borderRadius: '4px !important',
      padding: '6px 12px !important',
      animation: `yellowPulse 2s infinite !important`, // Use yellowPulse animation
      transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
      whiteSpace: 'nowrap',
      width: 'auto',
      color: '#ffffff !important',
    },
  };

  const bookButtonStyles = {
    root: {
      backgroundColor: '#28a745 !important', // Green background
      border: 'none !important',
      height: '40px !important',
      fontWeight: '600',
      borderRadius: '4px !important',
      padding: '6px 12px !important',
      animation: `greenPulse 2s infinite !important`, // Use greenPulse animation
      transition: 'box-shadow 0.3s, transform 0.3s, background 0.3s ease !important',
      whiteSpace: 'nowrap',
      width: 'auto',
      color: '#ffffff !important',
    },
  };

  // Leave action handlers
  const handleApproveLeaveClick = () => {
    if (approvalsNeeded.length > 0) {
      setBespokePanelContent(
        <AnnualLeaveApprovals
          approvals={approvalsNeeded.map((item) => ({
            id: item.id,
            person: item.person,
            start_date: item.start_date,
            end_date: item.end_date,
            reason: item.reason,
            status: item.status,
          }))}
          futureLeave={futureLeaveRecords.map((item) => ({
            id: item.id,
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
      setIsBespokePanelOpen(true);
    }
  };

  const handleBookLeaveClick = () => {
    if (bookingsNeeded.length > 0) {
      setBespokePanelContent(
        <AnnualLeaveBookings
          bookings={bookingsNeeded.map((item) => ({
            id: item.id,
            person: item.person,
            start_date: item.start_date,
            end_date: item.end_date,
            status: item.status,
            rejection_notes: item.rejection_notes,
          }))}
          onClose={() => setIsBespokePanelOpen(false)}
          team={teamData}
        />
      );
      setBespokePanelTitle('Book Requested Leave');
      setIsBespokePanelOpen(true);
    }
  };

  const immediateALActions = useMemo(() => {
    const actions: { title: string; onClick: () => void; icon?: string; styles?: any }[] = [];
    if (isApprover && approvalsNeeded.length > 0) {
      actions.push({
        title: 'Approve Annual Leave',
        onClick: handleApproveLeaveClick,
        icon: 'Warning',
        styles: approveButtonStyles,
      });
    }
    if (bookingsNeeded.length > 0) {
      actions.push({
        title: 'Book Requested Leave',
        onClick: handleBookLeaveClick,
        icon: 'Accept',
        styles: bookButtonStyles,
      });
    }
    return actions;
  }, [isApprover, approvalsNeeded, bookingsNeeded, approveButtonStyles, bookButtonStyles]);

  // Build immediate actions list
  let immediateActionsList: { title: string; onClick: () => void; icon?: string }[] = [];
  if (!isLoadingAttendance && !currentUserConfirmed) {
    immediateActionsList.push({
      title: 'Confirm Attendance',
      icon: 'Cancel',
      onClick: () => handleActionClick({ title: 'Confirm Attendance', icon: 'Accept' }),
    });
  }
  immediateActionsList = immediateActionsList.concat(immediateALActions);
  // Sort immediate actions by the predefined order.
  immediateActionsList.sort(
    (a, b) => (quickActionOrder[a.title] || 99) - (quickActionOrder[b.title] || 99)
  );

  function handleActionClick(action: { title: string; icon: string }) {
    let content: React.ReactNode = <div>No form available.</div>;
    const titleText = action.title;
  
    switch (titleText) {
      case "Confirm Attendance":
      case "Update Attendance":
        // The same form
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="109" />;
        break;
      case 'Create a Task':
        content = <Tasking />;
        break;
      case 'Request CollabSpace':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="44" />;
        break;
      case 'Save Telephone Note':
        content = <TelephoneAttendance />;
        break;
      case 'Save Attendance Note':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="38" />;
        break;
      case 'Request ID':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="60" />;
        break;
      case 'Open a Matter':
        content = <CognitoForm dataKey="QzaAr_2Q7kesClKq8g229g" dataForm="9" />;
        break;
      case 'Request Annual Leave':
        content = (
          <AnnualLeaveForm
            futureLeave={futureLeaveRecords}
            team={teamData}
            userData={userData}
            totals={annualLeaveTotals}
            bankHolidays={bankHolidays}
          />
        );
        break;
      default:
        content = <div>No form available.</div>;
        break;
    }
  
    setBespokePanelContent(content);
    setBespokePanelTitle(titleText);
    setIsBespokePanelOpen(true);
  }  

  let normalQuickActions = quickActions
    .filter((action) => {
      if (action.title === 'Confirm Attendance') {
        return currentUserConfirmed;
      }
      if (action.title === 'Request Annual Leave') {
        return approvalsNeeded.length === 0 && bookingsNeeded.length === 0;
      }
      return true;
    })
    .map((action) => {
      if (action.title === 'Confirm Attendance') {
        return { ...action, title: 'Update Attendance' };
      }
      return action;
    });
  // Sort normal actions by order.
  normalQuickActions.sort(
    (a, b) => (quickActionOrder[a.title] || 99) - (quickActionOrder[b.title] || 99)
  );

  // Consolidated Attendance Table – helper functions and components
  const getMondayOfCurrentWeek = (): Date => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday;
  };

  const getCurrentWeekKey = (): string => {
    const monday = getMondayOfCurrentWeek();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const options: Intl.DateTimeFormatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    const mondayStr = monday.toLocaleDateString('en-GB', options);
    const sundayStr = sunday.toLocaleDateString('en-GB', options);
    const mondayName = monday.toLocaleDateString('en-GB', { weekday: 'long' });
    const sundayName = sunday.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${mondayName}, ${mondayStr} - ${sundayName}, ${sundayStr}`;
  };

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const currentWeekKey = getCurrentWeekKey();
  const currentWeekMonday = getMondayOfCurrentWeek();
  const todayStr = new Date().toISOString().split('T')[0];

  const attendancePersons = useMemo(() => {
    return attendanceRecords
      .map((rec: any) => {
        const teamMember = teamData.find(
          (member: any) => member.First.toLowerCase() === rec.name.toLowerCase()
        );
        return {
          name: rec.name,
          initials: teamMember ? teamMember.Initials : rec.name,
          nickname: teamMember ? teamMember.Nickname : rec.name,
          attendance:
            rec.weeks && rec.weeks[currentWeekKey] ? rec.weeks[currentWeekKey].attendance : '',
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [attendanceRecords, teamData, currentWeekKey]);

  const getCellStatus = (
    personAttendance: string,
    personInitials: string,
    day: string,
    cellDateStr: string
  ): 'in' | 'wfh' | 'out' => {
    if (
      combinedLeaveRecords.some(
        (leave) =>
          leave.status === 'booked' &&
          leave.person.trim().toLowerCase() === personInitials.trim().toLowerCase() &&
          cellDateStr >= leave.start_date &&
          cellDateStr <= leave.end_date
      )
    ) {
      return 'out';
    }
    const attendedDays = personAttendance ? personAttendance.split(',').map((s: string) => s.trim()) : [];
    if (attendedDays.includes(day)) {
      return 'in';
    }
    return 'wfh';
  };

  const AttendanceCell: React.FC<{ status: 'in' | 'wfh' | 'out'; highlight?: boolean }> = ({
    status,
    highlight = false,
  }) => {
    let iconName = 'Home';
    if (status === 'in') {
      iconName = 'Accept';
    } else if (status === 'out') {
      iconName = 'Airplane';
    }
    return (
      <Icon
        iconName={iconName}
        styles={{ root: { fontSize: '24px', color: highlight ? '#fff' : '#666' } }}
      />
    );
  };

  const AttendancePersonaHeader: React.FC<{
    person: { name: string; initials: string; nickname: string; attendance: string };
  }> = ({ person }) => {
    const todayDate = new Date();
    let diffDays = Math.floor(
      (todayDate.getTime() - currentWeekMonday.getTime()) / (1000 * 3600 * 24)
    );
    let todayWeekday = 'Monday';
    if (diffDays >= 0 && diffDays < 5) {
      todayWeekday = weekDays[diffDays];
    }
    const currentStatus = getCellStatus(person.attendance, person.initials, todayWeekday, todayStr);
    let imageUrl = WfhImg;
    if (currentStatus === 'in') {
      imageUrl = InAttendanceImg;
    } else if (currentStatus === 'out') {
      imageUrl = OutImg;
    }
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <div
          style={{
            backgroundColor: isDarkMode ? colours.dark.grey || '#3a3a3a' : colours.light.grey || '#F4F4F6',
            padding: '4px 8px',
            borderRadius: '8px',
          }}
        >
          <Text
            variant="small"
            styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text } }}
          >
            {person.nickname || person.name}
          </Text>
        </div>
        <Persona
          text=""
          imageUrl={imageUrl}
          size={PersonaSize.size40}
          hidePersonaDetails
          styles={{ root: { margin: '0 auto' } }}
        />
      </div>
    );
  };

  const inHighlight = 'rgba(16,124,16,0.15)'; // subtle green tint
  const wfhHighlight = 'rgba(54,144,206,0.15)'; // subtle blue tint
  const outHighlight = 'rgba(214,85,65,0.15)'; // subtle red tint

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Greeting only */}
      <Stack
        horizontal
        horizontalAlign="space-between"
        verticalAlign="start"
        className={headerStyle}
      >
        <Stack verticalAlign="start" tokens={{ childrenGap: 8 }}>
          <Text className={greetingStyle(isDarkMode)}>{typedGreeting}</Text>
          {!isActionsLoading && (approvalsNeeded.length > 0 || bookingsNeeded.length > 0) && (
            <Text className={`${reviewMessageStyle(isDarkMode)} ${fadeInAnimationStyle}`}>
              You have items to review
              <Icon
                iconName="ChevronDown"
                aria-hidden="true"
                styles={{
                  root: {
                    marginLeft: '8px',
                    color: isDarkMode ? colours.cta : colours.cta,
                  },
                }}
              />
            </Text>
          )}
        </Stack>
      </Stack>

      {/* Quick Actions Bar */}
      <div
        className={quickLinksStyle(isDarkMode)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', gap: '10px' }}>
          {immediateActionsList.map((action, index) => (
            <QuickActionsCard
              key={action.title}
              title={action.title}
              icon={action.icon || ''}
              isDarkMode={isDarkMode}
              onClick={action.onClick}
              iconColor={colours.highlight}
              style={{ '--card-index': index } as React.CSSProperties}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {normalQuickActions.map((action, index) => (
            <QuickActionsCard
              key={action.title}
              title={action.title === 'Confirm Attendance' ? 'Update Attendance' : action.title}
              icon={action.icon}
              isDarkMode={isDarkMode}
              onClick={() => handleActionClick(action)}
              iconColor={colours.highlight}
              style={{ '--card-index': index } as React.CSSProperties}
              {...(action.title === 'Confirm Attendance' ? { confirmed: currentUserConfirmed } : {})}
            />
          ))}
        </div>
      </div>

      {/* Metrics Section Container */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          marginBottom: '40px'
        }}
      >
        {/* Time Metrics Section */}
        <CollapsibleSection title="Time Metrics" metrics={timeMetrics.map(m => ({ title: m.title }))}>
          <div
            className={mergeStyles({
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px'
            })}
          >
            {timeMetrics.map((metric, index) => (
              <MetricCard
                key={metric.title}
                title={metric.title}
                {...(metric.isMoneyOnly
                  ? { money: metric.money, prevMoney: metric.prevMoney, isMoneyOnly: metric.isMoneyOnly }
                  : metric.isTimeMoney
                  ? {
                      money: metric.money,
                      hours: metric.hours,
                      prevMoney: metric.prevMoney,
                      prevHours: metric.prevHours,
                      isTimeMoney: metric.isTimeMoney,
                      showDial: metric.showDial,
                      dialTarget: metric.dialTarget
                    }
                  : { count: metric.count, prevCount: metric.prevCount })}
                isDarkMode={isDarkMode}
                animationDelay={index * 0.1}
              />
            ))}
          </div>
        </CollapsibleSection>

        {/* Conversion Metrics Section */}
        <CollapsibleSection title="Conversion Metrics" metrics={enquiryMetrics.map(m => ({ title: m.title }))}>
          <div
            className={mergeStyles({
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px'
            })}
          >
            {enquiryMetrics.map((metric, index) => (
              <MetricCard
                key={metric.title}
                title={metric.title}
                {...(metric.isMoneyOnly
                  ? { money: metric.money, prevMoney: metric.prevMoney, isMoneyOnly: metric.isMoneyOnly }
                  : metric.isTimeMoney
                  ? {
                      money: metric.money,
                      hours: metric.hours,
                      prevMoney: metric.prevMoney,
                      prevHours: metric.prevHours,
                      isTimeMoney: metric.isTimeMoney
                    }
                  : { count: metric.count, prevCount: metric.prevCount })}
                isDarkMode={isDarkMode}
                animationDelay={index * 0.1}
              />
            ))}
          </div>
        </CollapsibleSection>
      </div>


      {/* Favourites Section */}
      {(formsFavorites.length > 0 || resourcesFavorites.length > 0) && (
        <div
          className={mergeStyles({
            backgroundColor: isDarkMode
              ? colours.dark.sectionBackground
              : colours.light.sectionBackground,
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
                    isFavorite
                    onCopy={(url: string, title: string) => {
                      navigator.clipboard
                        .writeText(url)
                        .then(() => console.log(`Copied '${title}' to clipboard.`))
                        .catch((err) => console.error('Failed to copy: ', err));
                    }}
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
                    onGoTo={() => window.open(form.url, '_blank')}
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
                    isFavorite
                    onCopy={(url: string, title: string) => {
                      navigator.clipboard
                        .writeText(url)
                        .then(() => console.log(`Copied '${title}' to clipboard.`))
                        .catch((err) => console.error('Failed to copy: ', err));
                    }}
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
      )}

      {/* Consolidated Attendance Table */}
      <div className={mergeStyles({ marginBottom: '40px' })}>
        <div className={sectionContainerStyle(isDarkMode)}>
          {isLoadingAttendance || isLoadingAnnualLeave ? (
            <Spinner label="Loading attendance..." size={SpinnerSize.medium} />
          ) : attendanceError || annualLeaveError ? (
            <MessageBar messageBarType={MessageBarType.error}>
              {attendanceError || annualLeaveError}
            </MessageBar>
          ) : (
            <table
              className={tableAnimationStyle}
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: '0',
                border: `1px solid ${
                  isDarkMode ? colours.dark.border : colours.light.border
                }`,
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <thead>
                <tr>
                  <th style={{ border: '1px solid transparent', padding: '8px' }}></th>
                  {attendancePersons.map((person) => (
                    <th
                      key={person.initials}
                      style={{
                        border: `1px solid ${
                          isDarkMode ? colours.dark.border : colours.light.border
                        }`,
                        padding: '8px',
                        textAlign: 'center',
                        backgroundColor: isDarkMode
                          ? colours.dark.sectionBackground
                          : colours.light.sectionBackground,
                      }}
                    >
                      <AttendancePersonaHeader person={person} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekDays.map((day, index) => {
                  const dayDate = new Date(currentWeekMonday);
                  dayDate.setDate(currentWeekMonday.getDate() + index);
                  const cellDateStr = dayDate.toISOString().split('T')[0];
                  const isCurrentDay = cellDateStr === todayStr;
                  return (
                    <tr key={day} style={isCurrentDay ? { backgroundColor: '#f0f8ff' } : {}}>
                      <td
                        style={{
                          border: `1px solid ${
                            isDarkMode ? colours.dark.border : colours.light.border
                          }`,
                          padding: '8px',
                          fontWeight: 'bold',
                          backgroundColor: colours.reporting.tableHeaderBackground,
                        }}
                      >
                        {day}
                      </td>
                      {attendancePersons.map((person) => {
                        const status = getCellStatus(
                          person.attendance,
                          person.initials,
                          day,
                          cellDateStr
                        );
                        const cellBg = isCurrentDay
                          ? status === 'in'
                            ? inHighlight
                            : status === 'wfh'
                            ? wfhHighlight
                            : outHighlight
                          : isDarkMode
                          ? colours.dark.sectionBackground
                          : colours.light.sectionBackground;
                        return (
                          <td
                            key={person.initials}
                            style={{
                              border: `1px solid ${
                                isDarkMode ? colours.dark.border : colours.light.border
                              }`,
                              padding: '8px',
                              textAlign: 'center',
                              backgroundColor: cellBg,
                            }}
                          >
                            <AttendanceCell status={status} highlight={isCurrentDay} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Contexts Panel */}
      <BespokePanel
        isOpen={isContextPanelOpen}
        onClose={() => setIsContextPanelOpen(false)}
        title="Context Details"
        width="800px"
      >
        {renderContextsPanelContent()}
      </BespokePanel>

      {/* Bespoke Panel for other actions */}
      <BespokePanel
        isOpen={isBespokePanelOpen}
        onClose={() => setIsBespokePanelOpen(false)}
        title={bespokePanelTitle}
        width="1000px"
      >
        {bespokePanelContent}
      </BespokePanel>

      {/* Selected Form Details */}
      {selectedForm && (
        <FormDetails
          isOpen={true}
          onClose={() => setSelectedForm(null)}
          link={selectedForm}
          isDarkMode={isDarkMode}
          userData={userData}
          matters={allMatters || []}
        />
      )}

      {/* Selected Resource Details */}
      {selectedResource && (
        <ResourceDetails resource={selectedResource} onClose={() => setSelectedResource(null)} />
      )}

      <div
        className={mergeStyles({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: '40px',
        })}
      >
        <Text className={versionStyle}>Version 1.1</Text>
        <IconButton
          iconProps={{ iconName: 'Info' }}
          title="Show context details"
          ariaLabel="Show context details"
          styles={{ root: { marginLeft: 8 }, icon: { fontSize: '16px' } }}
          onClick={() => setIsContextPanelOpen(true)}
        />
      </div>
    </div>
  );
};

export default Home;