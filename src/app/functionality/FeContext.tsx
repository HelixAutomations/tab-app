import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { TeamsContext } from './TeamsContext'; // Ensure this path is correct

// Define the structure of an Enquiry
export interface Enquiry {
  ID: string;
  Date_Created: string;
  Touchpoint_Date: string;
  Email: string;
  Area_of_Work: string;
  Type_of_Work: string;
  Method_of_Contact: string;
  Point_of_Contact: string;
  Company?: string;
  Website?: string;
  Title?: string;
  First_Name: string;
  Last_Name: string;
  DOB?: string;
  Phone_Number?: string;
  Secondary_Phone?: string;
  Tags?: string;
  Unit_Building_Name_or_Number?: string;
  Mailing_Street?: string;
  Mailing_Street_2?: string;
  Mailing_Street_3?: string;
  Postal_Code?: string;
  City?: string;
  Mailing_County?: string;
  Country?: string;
  Gift_Rank?: number;
  Matter_Ref?: string;
  Value?: string;
  Call_Taker?: string;
  Ultimate_Source?: string;
  Contact_Referrer?: string;
  Referring_Company?: string;
  Other_Referrals?: string;
  Referral_URL?: string;
  Campaign?: string;
  Ad_Group?: string;
  Search_Keyword?: string;
  GCLID?: string;
  Initial_first_call_notes?: string;
  Do_not_Market?: string;
  IP_Address?: string;
  TDMY?: string;
  TDN?: string;
  pocname?: string;
  Rating?: 'Good' | 'Neutral' | 'Poor';

  // **New Properties Added**
  Employment?: string;
  Divorce_Consultation?: string;
  Web_Form?: string; // Added Web_Form
}

// Define the structure of a Matter
export interface Matter {
  "Display Number": string;
  "Open Date": string;
  "MonthYear": string;
  "YearMonthNumeric": number;
  "Client ID": string;
  "Client Name": string;
  "Client Phone": string;
  "Client Email": string;
  "Status": string;
  "Unique ID": string;
  "Description": string;
  "Practice Area": string;
  "Source": string;
  "Referrer": string;
  "Responsible Solicitor": string;
  "Originating Solicitor": string;
  "Supervising Partner": string;
  "Opponent": string;
  "Opponent Solicitor": string;
  "Close Date": string;
  "Approx. Value": string;
  "mod_stamp": string;
  "method_of_contact": string;
  "CCL_date": string | null;
  Rating?: 'Good' | 'Neutral' | 'Poor';
}

// Define the structure of the FeContext
interface FeContextProps {
  sqlData: any;
  enquiries: Enquiry[]; // Added enquiries
  isLoading: boolean;
  error: string | null;
  fetchEnquiries: (
    email: string,
    dateFrom: string,
    dateTo: string
  ) => Promise<Enquiry[]>;
  fetchEnquiriesError: string | null;
  fetchMatters: (fullName: string) => Promise<Matter[]>;
  fetchMattersError: string | null;
  fetchUserData: (objectId: string) => Promise<any>; // Added fetchUserData
  fetchUserDataError: string | null; // Added error for fetchUserData
}

// Create the context with default values
const FeContext = createContext<FeContextProps>({
  sqlData: null,
  enquiries: [], // Initialized as empty array
  isLoading: false,
  error: null,
  fetchEnquiries: async () => [],
  fetchEnquiriesError: null,
  fetchMatters: async () => [],
  fetchMattersError: null,
  fetchUserData: async () => ({}), // Default implementation for fetchUserData
  fetchUserDataError: null, // Default error
});

// Define the provider's props to include children
interface FeProviderProps {
  children: ReactNode;
}

export const FeProvider: React.FC<FeProviderProps> = ({ children }) => {
  const { context } = useContext(TeamsContext); // Ensure TeamsContext provides 'context' with 'userObjectId'
  const [sqlData, setSqlData] = useState<any>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]); // Added enquiries state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchEnquiriesError, setFetchEnquiriesError] = useState<string | null>(null);
  const [fetchMattersError, setFetchMattersError] = useState<string | null>(null);
  const [fetchUserDataError, setFetchUserDataError] = useState<string | null>(null); // Added error state for fetchUserData

  // Environment Variables
  const proxyBaseUrl = process.env.REACT_APP_PROXY_BASE_URL;
  const getUserDataCode = process.env.REACT_APP_GET_USER_DATA_CODE;
  const getUserDataPath = process.env.REACT_APP_GET_USER_DATA_PATH;
  const getEnquiriesCode = process.env.REACT_APP_GET_ENQUIRIES_CODE;
  const getEnquiriesPath = process.env.REACT_APP_GET_ENQUIRIES_PATH;
  const getMattersCode = process.env.REACT_APP_GET_MATTERS_CODE;
  const getMattersPath = process.env.REACT_APP_GET_MATTERS_PATH;

  // Construct URLs
  const getUserDataUrl = `${proxyBaseUrl}/${getUserDataPath}?code=${getUserDataCode}`;
  const getEnquiriesUrl = `${proxyBaseUrl}/${getEnquiriesPath}?code=${getEnquiriesCode}`;
  const getMattersUrl = `${proxyBaseUrl}/${getMattersPath}?code=${getMattersCode}`;

  // Fetch User Data on Context Change
  const fetchUserData = useCallback(async (objectId: string): Promise<any> => {
    try {
      console.log('Fetching user data for object ID:', objectId);
      const response = await fetch(getUserDataUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userObjectId: objectId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.status}`);
      }

      const data = await response.json();
      console.log('User Data:', data);
      setSqlData(data); // Assuming user data is set here
      return data;
    } catch (error) {
      console.error('Error fetching user data:', error);
      setFetchUserDataError('Failed to fetch user data.');
      return {};
    }
  }, [getUserDataUrl]);

  // Function to fetch Enquiries
  const fetchEnquiries = useCallback(
    async (email: string, dateFrom: string, dateTo: string): Promise<Enquiry[]> => {
      try {
        console.log('Fetching enquiries with email:', email, 'from:', dateFrom, 'to:', dateTo);
        const response = await fetch(getEnquiriesUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, dateFrom, dateTo }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        let fetchedEnquiries: Enquiry[] = [];
        if (Array.isArray(data)) {
          fetchedEnquiries = data as Enquiry[];
        } else if (Array.isArray(data.enquiries)) {
          fetchedEnquiries = data.enquiries as Enquiry[];
        } else {
          console.warn('Unexpected data format:', data);
        }

        setEnquiries(fetchedEnquiries);
        return fetchedEnquiries;
      } catch (error) {
        console.error('Error fetching enquiries:', error);
        setFetchEnquiriesError('Failed to fetch enquiries.');
        return [];
      }
    },
    [getEnquiriesUrl]
  );

  // Function to fetch Matters
  const fetchMatters = useCallback(
    async (fullName: string): Promise<Matter[]> => {
      try {
        const response = await fetch(getMattersUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        let fetchedMatters: Matter[] = [];
        if (Array.isArray(data)) {
          fetchedMatters = data as Matter[];
        } else if (Array.isArray(data.matters)) {
          fetchedMatters = data.matters as Matter[];
        } else {
          console.warn('Unexpected data format:', data);
        }

        return fetchedMatters;
      } catch (error) {
        console.error('Error fetching matters:', error);
        setFetchMattersError('Failed to fetch matters.');
        return [];
      }
    },
    [getMattersUrl]
  );

  return (
    <FeContext.Provider
      value={{
        sqlData,
        enquiries,
        isLoading,
        error,
        fetchEnquiries,
        fetchEnquiriesError,
        fetchMatters,
        fetchMattersError,
        fetchUserData, // Provided fetchUserData
        fetchUserDataError, // Provided error state for fetchUserData
      }}
    >
      {children}
    </FeContext.Provider>
  );
};

export const useFeContext = () => useContext(FeContext);
