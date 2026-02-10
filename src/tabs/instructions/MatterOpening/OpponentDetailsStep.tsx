//
import React from "react"; // invisible change
// invisible change 2.2
import { Stack, TextField, Dropdown, IDropdownOption, PrimaryButton, Icon, FontIcon } from "@fluentui/react";

import { sharedPrimaryButtonStyles } from "../../../app/styles/ButtonStyles";
import "../../../app/styles/MultiSelect.css";
import BubbleTextField from "../../../app/styles/BubbleTextField";
import { useTheme } from "../../../app/functionality/ThemeContext";
import { countries } from "../../../data/referenceData";
import ModernMultiSelect from './ModernMultiSelect';
import {
  isPlaceholderValue,
  loadDataSheetFromStorage,
  saveDataSheetToStorage,
  markFieldAsPlaceholder,
  markFieldAsRealData,
  OpponentDataSheet
} from "../../../utils/opponentDataTracker";
import { colours } from "../../../app/styles/colours";
import ConflictConfirmationCard from './ConflictConfirmationCard';

// Local persistence helper mirroring FlatMatterOpening behaviour
function useDraftedState<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `matterOpeningDraft_${key}`;
  const [state, setState] = React.useState<T>(() => {
    try {
      const item = localStorage.getItem(storageKey);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [state, storageKey]);
  return [state, setState];
}

interface OpponentDetailsStepProps {
  opponentName: string;
  setOpponentName: (v: string) => void;
  opponentEmail: string;
  setOpponentEmail: (v: string) => void;
  opponentSolicitorName: string;
  setOpponentSolicitorName: (v: string) => void;
  opponentSolicitorCompany: string;
  setOpponentSolicitorCompany: (v: string) => void;
  opponentSolicitorEmail: string;
  setOpponentSolicitorEmail: (v: string) => void;
  noConflict: boolean;
  setNoConflict: (v: boolean) => void;
  disputeValue: string;
  setDisputeValue: (v: string) => void;
  setOpponentTitle?: (v: string) => void;
  opponentTitle?: string;
  setOpponentFirst?: (v: string) => void;
  opponentFirst?: string;
  setOpponentLast?: (v: string) => void;
  opponentLast?: string;
  setOpponentPhone?: (v: string) => void;
  opponentPhone?: string;
  setOpponentHouseNumber?: (v: string) => void;
  opponentHouseNumber?: string;
  setOpponentStreet?: (v: string) => void;
  opponentStreet?: string;
  setOpponentCity?: (v: string) => void;
  opponentCity?: string;
  setOpponentCounty?: (v: string) => void;
  opponentCounty?: string;
  setOpponentPostcode?: (v: string) => void;
  opponentPostcode?: string;
  setOpponentCountry?: (v: string) => void;
  opponentCountry?: string;
  opponentHasCompany?: boolean;
  setOpponentHasCompany?: (v: boolean) => void;
  opponentCompanyName?: string;
  setOpponentCompanyName?: (v: string) => void;
  opponentCompanyNumber?: string;
  setOpponentCompanyNumber?: (v: string) => void;
  // Solicitor fields
  setSolicitorTitle?: (v: string) => void;
  solicitorTitle?: string;
  setSolicitorFirst?: (v: string) => void;
  solicitorFirst?: string;
  setSolicitorLast?: (v: string) => void;
  solicitorLast?: string;
  setSolicitorPhone?: (v: string) => void;
  solicitorPhone?: string;
  setSolicitorHouseNumber?: (v: string) => void;
  solicitorHouseNumber?: string;
  setSolicitorStreet?: (v: string) => void;
  solicitorStreet?: string;
  setSolicitorCity?: (v: string) => void;
  solicitorCity?: string;
  setSolicitorCounty?: (v: string) => void;
  solicitorCounty?: string;
  setSolicitorPostcode?: (v: string) => void;
  solicitorPostcode?: string;
  setSolicitorCountry?: (v: string) => void;
  solicitorCountry?: string;
  solicitorCompanyNumber?: string;
  setSolicitorCompanyNumber?: (v: string) => void;
  // Choice tracking
  opponentChoiceMade?: boolean;
  setOpponentChoiceMade?: (v: boolean) => void;
  onContinue?: () => void; // <-- Add this line
  // Context for ConflictConfirmationCard
  clientName?: string;
  matterDescription?: string;
  /** Demo mode — auto-confirm conflict check */
  demoModeEnabled?: boolean;
}

const titleOptions: IDropdownOption[] = [
  { key: "", text: "Title" },
  // { key: "AI", text: "AI" }, // Hide AI from dropdown, but use as fallback
  { key: "Mr", text: "Mr" },
  { key: "Mrs", text: "Mrs" },
  { key: "Ms", text: "Ms" },
  { key: "Miss", text: "Miss" },
  { key: "Dr", text: "Dr" },
  { key: "Prof", text: "Prof" },
  { key: "Other", text: "Other" },
];

// Dynamic container style that responds to dark mode
const useContainerStyle = (isDarkMode: boolean): React.CSSProperties => ({
  background: isDarkMode ? '#111827' : '#F8FAFC',
  border: isDarkMode ? '1px solid #374151' : '1px solid #e3e8ef',
  borderRadius: 2,
  boxShadow: 'none',
  padding: '14px 14px 10px 14px',
  marginBottom: 12,
  marginTop: 4,
});

// Static styles moved inside component for dark mode support

// Inline validators (touched-gated)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneAllowed = /[0-9+()\-\s]/g;
const companyNumberRegex = /^(?:[A-Z]{2}\d{6}|\d{8})$/i; // Simplified UK formats

function getEmailErrorMessage(value: string, touched: boolean): string {
  if (!touched || !value) return "";
  return emailRegex.test(value) ? "" : "Enter a valid email";
}

function getPhoneErrorMessage(value: string, touched: boolean): string {
  if (!touched || !value) return "";
  const digits = (value.match(/\d/g) || []).length;
  const validChars = value.replace(phoneAllowed, "");
  if (validChars.length > 0) return "Phone contains invalid characters";
  return digits >= 7 ? "" : "Enter a valid phone number";
}

function getCompanyNumberErrorMessage(value: string, touched: boolean): string {
  if (!touched || !value) return "";
  return companyNumberRegex.test(value.trim()) ? "" : "Enter a valid UK company number";
}

// UK address parser (lightweight heuristic)
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;
function parseUKAddress(text: string) {
  const lines = text
    .split(/\n|,/) // allow comma or newline separated
    .map(s => s.trim())
    .filter(Boolean);

  let postcode = "";
  // Find postcode in any line
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(UK_POSTCODE);
    if (m) {
      postcode = m[1].toUpperCase().replace(/\s+/, " ");
      lines[i] = lines[i].replace(UK_POSTCODE, "").trim();
      if (!lines[i]) lines.splice(i, 1);
      break;
    }
  }

  const first = lines[0] || "";
  let houseNumber = "";
  let street = "";
  const firstParts = first.split(/\s+/);
  if (firstParts.length && /^\d+[A-Z]?$/i.test(firstParts[0])) {
    houseNumber = firstParts[0];
    street = firstParts.slice(1).join(" ");
  } else {
    street = first;
  }

  const tail = lines.slice(1);
  let city = tail.length ? tail[0] : "";
  let county = tail.length > 1 ? tail[1] : "";

  // Fallback: if only one tail element, treat it as city
  return { houseNumber, street, city, county, postcode };
}
// Pressed state mimics .navigatorPivot .ms-Pivot-link:active from NavigatorPivot.css
const pressedFieldStyle = {
  background: "rgba(0, 0, 0, 0.05)",
  color: "var(--helix-highlight, #3690CE)",
  border: "0.25px solid rgba(54, 144, 206, 0.4)",
  borderRadius: 0,
  boxShadow: "none",
  outline: "none",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
};

const addressFields = [
  { id: "houseNumber", placeholder: "House/Building Number or Name" },
  { id: "street", placeholder: "Street" },
  { id: "city", placeholder: "City/Town" },
  { id: "county", placeholder: "County" },
  { id: "postcode", placeholder: "Post Code" },
  { id: "country", placeholder: "Country" }
];

const dummyData = {
  opponentTitle: "Mr",
  opponentFirst: "Invent",
  opponentLast: "Name",
  opponentEmail: "opponent@helix-law.com",
  opponentPhone: "0345 314 2044",
  opponentHouseNumber: "Second Floor",
  opponentStreet: "Britannia House, 21 Station Street",
  opponentCity: "Brighton",
  opponentCounty: "East Sussex",
  opponentPostcode: "BN1 4DE",
  opponentCountry: "United Kingdom",
  opponentHasCompany: true,
  opponentCompanyName: "Helix Law Ltd",
  opponentCompanyNumber: "07845461",
  opponentSolicitorCompany: "Helix Law Ltd",
  solicitorCompanyNumber: "07845461",
  solicitorTitle: "Mr",
  solicitorFirst: "Invent",
  solicitorLast: "Solicitor Name",
  opponentSolicitorEmail: "opponentsolicitor@helix-law.com",
  solicitorPhone: "0345 314 2044",
  solicitorHouseNumber: "Second Floor",
  solicitorStreet: "Britannia House, 21 Station Street",
  solicitorCity: "Brighton",
  solicitorCounty: "East Sussex",
  solicitorPostcode: "BN1 4DE",
  solicitorCountry: "United Kingdom"
};

const OpponentDetailsStep: React.FC<OpponentDetailsStepProps> = ({
  opponentName,
  setOpponentName,
  opponentEmail,
  setOpponentEmail,
  opponentSolicitorName,
  setOpponentSolicitorName,
  opponentSolicitorCompany,
  setOpponentSolicitorCompany,
  opponentSolicitorEmail,
  setOpponentSolicitorEmail,
  noConflict,
  setNoConflict,
  disputeValue,
  setDisputeValue,
  // New/extended props
  setOpponentTitle,
  opponentTitle,
  setOpponentFirst,
  opponentFirst,
  setOpponentLast,
  opponentLast,
  setOpponentPhone,
  opponentPhone,
  setOpponentHouseNumber,
  opponentHouseNumber,
  setOpponentStreet,
  opponentStreet,
  setOpponentCity,
  opponentCity,
  setOpponentCounty,
  opponentCounty,
  setOpponentPostcode,
  opponentPostcode,
  setOpponentCountry,
  opponentCountry,
  opponentHasCompany,
  setOpponentHasCompany,
  opponentCompanyName,
  setOpponentCompanyName,
  opponentCompanyNumber,
  setOpponentCompanyNumber,
  setSolicitorTitle,
  solicitorTitle,
  setSolicitorFirst,
  solicitorFirst,
  setSolicitorLast,
  solicitorLast,
  setSolicitorPhone,
  solicitorPhone,
  setSolicitorHouseNumber,
  solicitorHouseNumber,
  setSolicitorStreet,
  solicitorStreet,
  setSolicitorCity,
  solicitorCity,
  setSolicitorCounty,
  solicitorCounty,
  setSolicitorPostcode,
  solicitorPostcode,
  setSolicitorCountry,
  solicitorCountry,
  solicitorCompanyNumber,
  setSolicitorCompanyNumber,
  // Choice tracking
  opponentChoiceMade,
  setOpponentChoiceMade,
  onContinue, // <-- Add this line
  // Context for ConflictConfirmationCard
  clientName = '',
  matterDescription = '',
  demoModeEnabled = false,
}) => {
  // Local state for new fields if not provided by parent
  const [localOpponentTitle, setLocalOpponentTitle] = React.useState("");
  const [localOpponentFirst, setLocalOpponentFirst] = React.useState("");
  const [localOpponentLast, setLocalOpponentLast] = React.useState("");
  const [localOpponentPhone, setLocalOpponentPhone] = React.useState("");
  const [localOpponentAddress, setLocalOpponentAddress] = React.useState("");
  const [localOpponentHasCompany, setLocalOpponentHasCompany] = React.useState(false);
  const [localOpponentCompanyName, setLocalOpponentCompanyName] = React.useState("");
  const [localOpponentCompanyNumber, setLocalOpponentCompanyNumber] = React.useState("");
  // Opponent company address (for Individual opponents too)
  const [localOpponentCompanyHouseNumber, setLocalOpponentCompanyHouseNumber] = useDraftedState<string>('opponentCompanyHouseNumber', "");
  const [localOpponentCompanyStreet, setLocalOpponentCompanyStreet] = useDraftedState<string>('opponentCompanyStreet', "");
  const [localOpponentCompanyCity, setLocalOpponentCompanyCity] = useDraftedState<string>('opponentCompanyCity', "");
  const [localOpponentCompanyCounty, setLocalOpponentCompanyCounty] = useDraftedState<string>('opponentCompanyCounty', "");
  const [localOpponentCompanyPostcode, setLocalOpponentCompanyPostcode] = useDraftedState<string>('opponentCompanyPostcode', "");
  const [localOpponentCompanyCountry, setLocalOpponentCompanyCountry] = useDraftedState<string>('opponentCompanyCountry', "");
  const [localSolicitorTitle, setLocalSolicitorTitle] = React.useState("");
  const [localSolicitorFirst, setLocalSolicitorFirst] = React.useState("");
  const [localSolicitorLast, setLocalSolicitorLast] = React.useState("");
  const [localSolicitorPhone, setLocalSolicitorPhone] = React.useState("");
  const [localSolicitorCompanyNumber, setLocalSolicitorCompanyNumber] = React.useState("");

  // Add local state for email fields if not provided by parent
  const [localOpponentEmail, setLocalOpponentEmail] = useDraftedState<string>('opponentEmail', "");
  const [localOpponentSolicitorEmail, setLocalOpponentSolicitorEmail] = useDraftedState<string>('opponentSolicitorEmail', "");

  // Add local state for address fields if not provided by parent
  const [localOpponentHouseNumber, setLocalOpponentHouseNumber] = useDraftedState<string>('opponentHouseNumber', "");
  const [localOpponentStreet, setLocalOpponentStreet] = useDraftedState<string>('opponentStreet', "");
  const [localOpponentCity, setLocalOpponentCity] = useDraftedState<string>('opponentCity', "");
  const [localOpponentCounty, setLocalOpponentCounty] = useDraftedState<string>('opponentCounty', "");
  const [localOpponentPostcode, setLocalOpponentPostcode] = useDraftedState<string>('opponentPostcode', "");
  const [localOpponentCountry, setLocalOpponentCountry] = useDraftedState<string>('opponentCountry', "");

  const [localSolicitorHouseNumber, setLocalSolicitorHouseNumber] = useDraftedState<string>('solicitorHouseNumber', "");
  const [localSolicitorStreet, setLocalSolicitorStreet] = useDraftedState<string>('solicitorStreet', "");
  const [localSolicitorCity, setLocalSolicitorCity] = useDraftedState<string>('solicitorCity', "");
  const [localSolicitorCounty, setLocalSolicitorCounty] = useDraftedState<string>('solicitorCounty', "");
  const [localSolicitorPostcode, setLocalSolicitorPostcode] = useDraftedState<string>('solicitorPostcode', "");
  const [localSolicitorCountry, setLocalSolicitorCountry] = useDraftedState<string>('solicitorCountry', "");

  // Use parent state if provided, else local state
  const _opponentTitle = opponentTitle ?? localOpponentTitle;
  const _setOpponentTitle = setOpponentTitle ?? setLocalOpponentTitle;
  const _opponentFirst = opponentFirst ?? localOpponentFirst;
  const _setOpponentFirst = setOpponentFirst ?? setLocalOpponentFirst;
  const _opponentLast = opponentLast ?? localOpponentLast;
  const _setOpponentLast = setOpponentLast ?? setLocalOpponentLast;
  const _opponentEmail = opponentEmail ?? localOpponentEmail;
  const _setOpponentEmail = setOpponentEmail ?? setLocalOpponentEmail;
  const _opponentPhone = opponentPhone ?? localOpponentPhone;
  const _setOpponentPhone = setOpponentPhone ?? setLocalOpponentPhone;
  const _opponentHouseNumber = opponentHouseNumber ?? localOpponentHouseNumber;
  const _setOpponentHouseNumber = setOpponentHouseNumber ?? setLocalOpponentHouseNumber;
  const _opponentStreet = opponentStreet ?? localOpponentStreet;
  const _setOpponentStreet = setOpponentStreet ?? setLocalOpponentStreet;
  const _opponentCity = opponentCity ?? localOpponentCity;
  const _setOpponentCity = setOpponentCity ?? setLocalOpponentCity;
  const _opponentCounty = opponentCounty ?? localOpponentCounty;
  const _setOpponentCounty = setOpponentCounty ?? setLocalOpponentCounty;
  const _opponentPostcode = opponentPostcode ?? localOpponentPostcode;
  const _setOpponentPostcode = setOpponentPostcode ?? setLocalOpponentPostcode;
  const _opponentCountry = opponentCountry ?? localOpponentCountry;
  const _setOpponentCountry = setOpponentCountry ?? setLocalOpponentCountry;
  const _opponentHasCompany = opponentHasCompany ?? localOpponentHasCompany;
  const _setOpponentHasCompany = setOpponentHasCompany ?? setLocalOpponentHasCompany;
  const _opponentCompanyName = opponentCompanyName ?? localOpponentCompanyName;
  const _setOpponentCompanyName = setOpponentCompanyName ?? setLocalOpponentCompanyName;
  const _opponentCompanyNumber = opponentCompanyNumber ?? localOpponentCompanyNumber;
  const _setOpponentCompanyNumber = setOpponentCompanyNumber ?? setLocalOpponentCompanyNumber;
  const _opponentCompanyHouseNumber = localOpponentCompanyHouseNumber;
  const _setOpponentCompanyHouseNumber = setLocalOpponentCompanyHouseNumber;
  const _opponentCompanyStreet = localOpponentCompanyStreet;
  const _setOpponentCompanyStreet = setLocalOpponentCompanyStreet;
  const _opponentCompanyCity = localOpponentCompanyCity;
  const _setOpponentCompanyCity = setLocalOpponentCompanyCity;
  const _opponentCompanyCounty = localOpponentCompanyCounty;
  const _setOpponentCompanyCounty = setLocalOpponentCompanyCounty;
  const _opponentCompanyPostcode = localOpponentCompanyPostcode;
  const _setOpponentCompanyPostcode = setLocalOpponentCompanyPostcode;
  const _opponentCompanyCountry = localOpponentCompanyCountry;
  const _setOpponentCompanyCountry = setLocalOpponentCompanyCountry;
  const _solicitorTitle = solicitorTitle ?? localSolicitorTitle;
  const _setSolicitorTitle = setSolicitorTitle ?? setLocalSolicitorTitle;
  const _solicitorFirst = solicitorFirst ?? localSolicitorFirst;
  const _setSolicitorFirst = setSolicitorFirst ?? setLocalSolicitorFirst;
  const _solicitorLast = solicitorLast ?? localSolicitorLast;
  const _setSolicitorLast = setSolicitorLast ?? setLocalSolicitorLast;
  const _solicitorPhone = solicitorPhone ?? localSolicitorPhone;
  const _setSolicitorPhone = setSolicitorPhone ?? setLocalSolicitorPhone;
  const _solicitorHouseNumber = solicitorHouseNumber ?? localSolicitorHouseNumber;
  const _setSolicitorHouseNumber = setSolicitorHouseNumber ?? setLocalSolicitorHouseNumber;
  const _solicitorStreet = solicitorStreet ?? localSolicitorStreet;
  const _setSolicitorStreet = setSolicitorStreet ?? setLocalSolicitorStreet;
  const _solicitorCity = solicitorCity ?? localSolicitorCity;
  const _setSolicitorCity = setSolicitorCity ?? setLocalSolicitorCity;
  const _solicitorCounty = solicitorCounty ?? localSolicitorCounty;
  const _setSolicitorCounty = setSolicitorCounty ?? setLocalSolicitorCounty;
  const _solicitorPostcode = solicitorPostcode ?? localSolicitorPostcode;
  const _setSolicitorPostcode = setSolicitorPostcode ?? setLocalSolicitorPostcode;
  const _solicitorCountry = solicitorCountry ?? localSolicitorCountry;
  const _setSolicitorCountry = setSolicitorCountry ?? setLocalSolicitorCountry;
  const _solicitorCompanyNumber = solicitorCompanyNumber ?? localSolicitorCompanyNumber;
  const _setSolicitorCompanyNumber = setSolicitorCompanyNumber ?? setLocalSolicitorCompanyNumber;
  const _opponentSolicitorEmail = opponentSolicitorEmail ?? localOpponentSolicitorEmail;
  const _setOpponentSolicitorEmail = setOpponentSolicitorEmail ?? setLocalOpponentSolicitorEmail;

  const { isDarkMode } = useTheme();
  
  // Get dynamic container style
  const containerStyle = useContainerStyle(isDarkMode);

  // Dynamic text color for dark mode
  const fieldTextColor = isDarkMode ? "#e5e7eb" : "#061733";
  // Consistent icon color using standard highlight color
  const iconColor = colours.highlight;

  // Dynamic field styles that respond to dark mode
  const placeholderFieldStyle = React.useMemo(() => ({
    background: isDarkMode ? "#1f2937" : "#fafbfc",
    color: isDarkMode ? "#6b7280" : "#9ca3af",
    border: "none",
    borderRadius: 0,
    boxShadow: isDarkMode ? "0 1px 2px rgba(0,0,0,0.2)" : "0 1px 2px rgba(0,0,0,0.02)",
    transition: "background 0.2s, color 0.2s, border 0.2s"
  }), [isDarkMode]);

  const unansweredFieldStyle = React.useMemo(() => ({
    background: isDarkMode ? "#0f172a" : "#FFFFFF",
    color: isDarkMode ? "#e5e7eb" : "#061733",
    border: "none",
    borderRadius: 0,
    boxShadow: isDarkMode ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.08)",
    transition: "background 0.2s, color 0.2s, border 0.2s"
  }), [isDarkMode]);

  const answeredFieldStyleDynamic = React.useMemo(() => ({
    background: isDarkMode ? "rgba(54, 144, 206, 0.15)" : "rgba(54, 144, 206, 0.10)",
    color: isDarkMode ? "#e5e7eb" : "#061733",
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
    transition: "background 0.2s, color 0.2s, border 0.2s"
  }), [isDarkMode]);

  const pressedFieldStyleDynamic = React.useMemo(() => ({
    background: isDarkMode ? "rgba(54, 144, 206, 0.20)" : "rgba(54, 144, 206, 0.15)",
    border: "none",
    borderRadius: 0,
    boxShadow: isDarkMode ? "0 0 0 2px rgba(54, 144, 206, 0.4), 0 1px 3px rgba(0,0,0,0.2)" : "0 0 0 2px rgba(54, 144, 206, 0.3), 0 1px 3px rgba(0,0,0,0.06)",
    marginTop: 4,
    transition: "box-shadow 0.2s, border-color 0.2s"
  }), [isDarkMode]);

  // Unified pill container styling (encapsulates header, hint, and fields)
  const chipContainer = (checked: boolean): React.CSSProperties => {
    const accent = colours.highlight;
    const baseBorder = isDarkMode ? '#374151' : '#CBD5E1';
    const checkedBorder = isDarkMode ? `${accent}66` : '#c9dfef';
    
    return {
      background: checked
        ? (isDarkMode ? `${accent}18` : `${accent}08`)
        : (isDarkMode ? '#111827' : '#FFFFFF'),
      border: `1px solid ${checked ? checkedBorder : baseBorder}`,
      borderRadius: 0,
      boxShadow: 'none',
      padding: '8px 10px',
      margin: '4px 0 8px 0',
      transition: 'background 120ms ease, border-color 120ms ease'
    };
  };

  // Section visibility selection (persisted)
  type SectionKey = 'name' | 'contact' | 'address' | 'company';
  type PartyKey = 'opponent' | 'solicitor';
  const [visibleSections, setVisibleSections] = useDraftedState<{
    opponent: Record<SectionKey, boolean>;
    solicitor: Record<SectionKey, boolean>;
  }>('visibleSections', {
    opponent: { name: false, contact: false, address: false, company: false },
    solicitor: { name: false, contact: false, address: false, company: false }
  });
  const toggleSection = (party: PartyKey, section: SectionKey) => {
    setVisibleSections(prev => ({
      ...prev,
      [party]: { ...prev[party], [section]: !prev[party][section] }
    }));
  };

  // On load, screen prefilled data against static indicators/sheet and mark placeholders
  React.useEffect(() => {
    try {
      let sheet: OpponentDataSheet = loadDataSheetFromStorage();
      const entries: Array<[string, string]> = [
        ['opponentTitle', _opponentTitle],
        ['opponentFirst', _opponentFirst],
        ['opponentLast', _opponentLast],
        ['opponentEmail', _opponentEmail],
        ['opponentPhone', _opponentPhone],
        ['opponentHouseNumber', _opponentHouseNumber],
        ['opponentStreet', _opponentStreet],
        ['opponentCity', _opponentCity],
        ['opponentCounty', _opponentCounty],
        ['opponentPostcode', _opponentPostcode],
        ['opponentCountry', _opponentCountry],
        ['opponentCompanyName', _opponentCompanyName],
        ['opponentCompanyNumber', _opponentCompanyNumber],
  ['opponentCompanyHouseNumber', _opponentCompanyHouseNumber],
  ['opponentCompanyStreet', _opponentCompanyStreet],
  ['opponentCompanyCity', _opponentCompanyCity],
  ['opponentCompanyCounty', _opponentCompanyCounty],
  ['opponentCompanyPostcode', _opponentCompanyPostcode],
  ['opponentCompanyCountry', _opponentCompanyCountry],
        ['opponentSolicitorCompany', opponentSolicitorCompany],
        ['solicitorCompanyNumber', _solicitorCompanyNumber],
        ['solicitorTitle', _solicitorTitle],
        ['solicitorFirst', _solicitorFirst],
        ['solicitorLast', _solicitorLast],
        ['opponentSolicitorEmail', _opponentSolicitorEmail],
        ['solicitorPhone', _solicitorPhone],
        ['solicitorHouseNumber', _solicitorHouseNumber],
        ['solicitorStreet', _solicitorStreet],
        ['solicitorCity', _solicitorCity],
        ['solicitorCounty', _solicitorCounty],
        ['solicitorPostcode', _solicitorPostcode],
        ['solicitorCountry', _solicitorCountry]
      ];

      const newFlags: { [k: string]: boolean } = {};
      let changed = false;
      entries.forEach(([key, val]) => {
        const v = (val ?? '').trim();
        if (!v) return;
        const existing = sheet.fields?.[key];
        // Treat known dummyData values as placeholders when reloading
        const dummyMatch = (dummyData as Record<string, unknown>)[key] === val;
        const isPh = existing ? existing.isPlaceholder : (isPlaceholderValue(v) || !!dummyMatch);
        newFlags[key] = isPh;
        const nextSheet = isPh
          ? markFieldAsPlaceholder(sheet, key, v)
          : markFieldAsRealData(sheet, key, v);
        if (nextSheet !== sheet) {
          sheet = nextSheet;
          changed = true;
        }
      });
      if (Object.keys(newFlags).length) {
        setPlaceholderFilledFields(prev => ({ ...prev, ...newFlags }));
      }
      if (changed) saveDataSheetToStorage(sheet);
    } catch {}
    // We only want to screen once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add this function inside the component
  // Clear placeholder/dummy data so user starts with empty fields
  const clearPlaceholderData = () => {
    // Clear opponent individual fields
    _setOpponentTitle('');
    _setOpponentFirst('');
    _setOpponentLast('');
    _setOpponentEmail('');
    _setOpponentPhone('');
    _setOpponentHouseNumber('');
    _setOpponentStreet('');
    _setOpponentCity('');
    _setOpponentCounty('');
    _setOpponentPostcode('');
    _setOpponentCountry('');
    _setOpponentHasCompany(false);
    _setOpponentCompanyName('');
    _setOpponentCompanyNumber('');
    _setOpponentCompanyHouseNumber('');
    _setOpponentCompanyStreet('');
    _setOpponentCompanyCity('');
    _setOpponentCompanyCounty('');
    _setOpponentCompanyPostcode('');
    _setOpponentCompanyCountry('');

    // Clear solicitor fields
    setOpponentSolicitorCompany('');
    _setSolicitorCompanyNumber('');
    _setSolicitorTitle('');
    _setSolicitorFirst('');
    _setSolicitorLast('');
    _setOpponentSolicitorEmail('');
    _setSolicitorPhone('');
    _setSolicitorHouseNumber('');
    _setSolicitorStreet('');
    _setSolicitorCity('');
    _setSolicitorCounty('');
    _setSolicitorPostcode('');
    _setSolicitorCountry('');

    // Clear all placeholder and touched flags
    setPlaceholderFilledFields({});
    setTouchedFields({});
  };

  const fillDummyData = () => {
    if (!opponentType) {
      setOpponentType('Company');
    }

    _setOpponentTitle(dummyData.opponentTitle);
    _setOpponentFirst(dummyData.opponentFirst);
    _setOpponentLast(dummyData.opponentLast);
    _setOpponentEmail(dummyData.opponentEmail);
    _setOpponentPhone(dummyData.opponentPhone);
    _setOpponentHouseNumber(dummyData.opponentHouseNumber);
    _setOpponentStreet(dummyData.opponentStreet);
    _setOpponentCity(dummyData.opponentCity);
    _setOpponentCounty(dummyData.opponentCounty);
    _setOpponentPostcode(dummyData.opponentPostcode);
    _setOpponentCountry(dummyData.opponentCountry);
    _setOpponentHasCompany(dummyData.opponentHasCompany);
    _setOpponentCompanyName(dummyData.opponentCompanyName);
    _setOpponentCompanyNumber(dummyData.opponentCompanyNumber);
  // Use opponent address dummy values for company address as defaults
  _setOpponentCompanyHouseNumber(dummyData.opponentHouseNumber);
  _setOpponentCompanyStreet(dummyData.opponentStreet);
  _setOpponentCompanyCity(dummyData.opponentCity);
  _setOpponentCompanyCounty(dummyData.opponentCounty);
  _setOpponentCompanyPostcode(dummyData.opponentPostcode);
  _setOpponentCompanyCountry(dummyData.opponentCountry);

    setOpponentSolicitorCompany(dummyData.opponentSolicitorCompany);
    _setSolicitorCompanyNumber(dummyData.solicitorCompanyNumber);
    _setSolicitorTitle(dummyData.solicitorTitle);
    _setSolicitorFirst(dummyData.solicitorFirst);
    _setSolicitorLast(dummyData.solicitorLast);
    _setOpponentSolicitorEmail(dummyData.opponentSolicitorEmail);
    _setSolicitorPhone(dummyData.solicitorPhone);
    _setSolicitorHouseNumber(dummyData.solicitorHouseNumber);
    _setSolicitorStreet(dummyData.solicitorStreet);
    _setSolicitorCity(dummyData.solicitorCity);
    _setSolicitorCounty(dummyData.solicitorCounty);
    _setSolicitorPostcode(dummyData.solicitorPostcode);
    _setSolicitorCountry(dummyData.solicitorCountry);

    // Mark these fields as placeholder-filled (but NOT as touched by user)
    setPlaceholderFilledFields(prev => ({
      ...prev,
      opponentTitle: true,
      opponentFirst: true,
      opponentLast: true,
      opponentEmail: true,
      opponentPhone: true,
      opponentHouseNumber: true,
      opponentStreet: true,
      opponentCity: true,
      opponentCounty: true,
      opponentPostcode: true,
      opponentCountry: true,
      opponentCompanyName: true,
      opponentCompanyNumber: true,
  opponentCompanyHouseNumber: true,
  opponentCompanyStreet: true,
  opponentCompanyCity: true,
  opponentCompanyCounty: true,
  opponentCompanyPostcode: true,
  opponentCompanyCountry: true,
      opponentSolicitorCompany: true,
      solicitorCompanyNumber: true,
      solicitorTitle: true,
      solicitorFirst: true,
      solicitorLast: true,
      opponentSolicitorEmail: true,
      solicitorPhone: true,
      solicitorHouseNumber: true,
      solicitorStreet: true,
      solicitorCity: true,
      solicitorCounty: true,
      solicitorPostcode: true,
      solicitorCountry: true,
    }));
  };

  const copyCompanyAddressToPersonal = () => {
    _setOpponentHouseNumber(_opponentCompanyHouseNumber);
    _setOpponentStreet(_opponentCompanyStreet);
    _setOpponentCity(_opponentCompanyCity);
    _setOpponentCounty(_opponentCompanyCounty);
    _setOpponentPostcode(_opponentCompanyPostcode);
    _setOpponentCountry(_opponentCompanyCountry);
    setTouchedFields(prev => ({
      ...prev,
      opponentHouseNumber: true,
      opponentStreet: true,
      opponentCity: true,
      opponentCounty: true,
      opponentPostcode: true,
      opponentCountry: true,
    }));
    // Ensure style updates from placeholder grey to answered blue
    setPlaceholderFilledFields(prev => ({
      ...prev,
      opponentHouseNumber: false,
      opponentStreet: false,
      opponentCity: false,
      opponentCounty: false,
      opponentPostcode: false,
      opponentCountry: false,
    }));
  };

  // Persisted state for preview and opponent choices
  const [showSummary, setShowSummary] = useDraftedState<boolean>('showSummary', false);
  // Toggle: does user want to enter opponent details now?
  const [enterOpponentNow, setEnterOpponentNow] = useDraftedState<null | boolean>('enterOpponentNow', null);
  // Add new state for opponent type (Individual or Company)
  const [opponentType, setOpponentType] = useDraftedState<string>('opponentType', "");
  // removed address paste helpers (opponent & solicitor) per spec

  // Reduce noise: once opponent type is chosen, default to entering details and open the minimum section.
  React.useEffect(() => {
    if (!opponentType) return;
    if (enterOpponentNow !== null) return;
    setEnterOpponentNow(true);
    setShowSummary(false);
    setVisibleSections({
      opponent: {
        name: opponentType === 'Individual',
        company: opponentType === 'Company',
        contact: false,
        address: false,
      },
      solicitor: { name: false, contact: false, address: false, company: false },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentType]);

  // Demo mode: auto-select "I'll add details later" so user doesn't have to confirm
  React.useEffect(() => {
    if (!demoModeEnabled) return;
    if (!opponentType) setOpponentType('Company');
    setEnterOpponentNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoModeEnabled]);

  // Skip details and show summary (user can return to edit later)
  const skipAndShowSummary = () => {
    setShowSummary(true);
  };

  // Reset to editable mode
  const handleEdit = () => {
    setShowSummary(false);
  };

  // Helper to render a summary row (clean, compact)
  const SummaryRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{
      display: "flex",
      alignItems: "center",
      marginBottom: 2,
      fontSize: 14,
      color: "#2d3748"
    }}>
      <span style={{ minWidth: 110, color: "#6b7280", fontWeight: 400 }}>{label}</span>
      <span style={{ color: value ? "#222" : "#b0b7be", marginLeft: 8 }}>{value || <span>—</span>}</span>
    </div>
  );

  // Helper to render address summary (compact)
  const AddressSummary = (data: any) => (
    <div>
      <SummaryRow label="House/Building or Name" value={data.houseNumber} />
      <SummaryRow label="Street" value={data.street} />
      <SummaryRow label="City/Town" value={data.city} />
      <SummaryRow label="County" value={data.county} />
      <SummaryRow label="Post Code" value={data.postcode} />
      <SummaryRow label="Country" value={data.country} />
    </div>
  );

  // Clean summary group with icon, label, and card background
  const SummaryGroup = ({
    iconName,
    label,
    children,
    style = {},
    forceWhite = false,
  }: {
    iconName: string;
    label: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    forceWhite?: boolean;
  }) => (
    <div
      style={{
        background: forceWhite ? (isDarkMode ? '#111827' : '#FFFFFF') : (isDarkMode ? '#111827' : '#F8FAFC'),
        border: forceWhite ? 'none' : `1px solid ${isDarkMode ? '#374151' : '#CBD5E1'}`,
        borderRadius: 0,
        boxShadow: 'none',
        padding: "16px 18px 12px 18px",
        marginBottom: 14,
        marginTop: 4,
        transition: "box-shadow 0.2s, border-color 0.2s",
        ...style
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 10,
        fontSize: 15,
        color: "#3b5b7e"
      }}>
        <FontIcon iconName={iconName} style={{ fontSize: 18, marginRight: 10, color: iconColor }} />
        <span style={{ fontWeight: 600, letterSpacing: 0.2 }}>{label}</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "0 18px",
        }}
      >
        {children}
      </div>
    </div>
  );

  // Add local state for focus/blur/active for each field group
  const [activeField, setActiveField] = React.useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useDraftedState<{ [key: string]: boolean }>('touchedFields', {});
  const [placeholderFilledFields, setPlaceholderFilledFields] = useDraftedState<{ [key: string]: boolean }>('placeholderFilledFields', {});

  // When a field is populated by placeholder data, render it as empty until the user interacts
  const displayValue = React.useCallback(
    (fieldKey: string, raw: string): string => {
      return placeholderFilledFields[fieldKey] && !touchedFields[fieldKey] ? "" : raw;
    },
    [placeholderFilledFields, touchedFields]
  );

  // Same logic for select-type fields (e.g., Dropdown selectedKey)
  const displaySelectKey = React.useCallback(
    (fieldKey: string, raw: string | number | undefined): string | number | undefined => {
      return placeholderFilledFields[fieldKey] && !touchedFields[fieldKey] ? undefined : raw;
    },
    [placeholderFilledFields, touchedFields]
  );

  // Helper to get field style
  function getFieldStyle(fieldKey: string, value: string, isDropdown = false) {
    const isActive = activeField === fieldKey;
    const isTouched = touchedFields[fieldKey];
    const isPlaceholderFilled = placeholderFilledFields[fieldKey];
    
    if (isActive) return pressedFieldStyleDynamic;
    // FIXED: Don't show placeholder styling for fields with placeholder data
    // If field has been touched OR has real user data, show as answered
    if (isTouched && value) return answeredFieldStyleDynamic;
    // If field has placeholder data but user hasn't interacted, treat as unanswered
    // This prevents showing grayed-out placeholder values to the user
    return unansweredFieldStyle;
  }

  // Helper to handle field focus - clears placeholder status when user starts typing
  const handleFieldFocus = (fieldKey: string) => {
    setActiveField(fieldKey);
    // Clear placeholder status when user focuses on field
    if (placeholderFilledFields[fieldKey]) {
      setPlaceholderFilledFields(prev => ({ ...prev, [fieldKey]: false }));
    }
  };

  // Helper to handle field blur - marks field as touched
  const handleFieldBlur = (fieldKey: string) => {
    setActiveField(null);
    setTouchedFields((prev) => ({ ...prev, [fieldKey]: true }));
  };

  // Remove blue border on focus for all intake fields using inline style override
  // (for TextField, Dropdown, etc.)
  // Add this style to all fieldGroup and dropdown/title style objects:
  const noFocusOutline = {
    outline: "none",
    boxShadow: "none",
    borderColor: "transparent"
  };

  // Prefill default countries to reduce clicks; show as answered (blue)
  React.useEffect(() => {
    const UK = 'United Kingdom';
    const updates: Record<string, string> = {};
    if (!_opponentCountry) {
      _setOpponentCountry(UK);
      updates.opponentCountry = UK;
    }
    if (!_opponentCompanyCountry) {
      _setOpponentCompanyCountry(UK);
      updates.opponentCompanyCountry = UK;
    }
    if (!_solicitorCountry) {
      _setSolicitorCountry(UK);
      updates.solicitorCountry = UK;
    }
    if (Object.keys(updates).length) {
      // Mark as answered (blue): clear placeholder flags and set touched
      setPlaceholderFilledFields(prev => ({
        ...prev,
        ...Object.fromEntries(Object.keys(updates).map(k => [k, false]))
      }));
      setTouchedFields(prev => ({
        ...prev,
        ...Object.fromEntries(Object.keys(updates).map(k => [k, true]))
      }));
      try {
        let sheet = loadDataSheetFromStorage();
        Object.entries(updates).forEach(([k, v]) => {
          sheet = markFieldAsRealData(sheet, k, v);
        });
        saveDataSheetToStorage(sheet);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      background: isDarkMode ? '#0F172A' : '#FFFFFF',
      border: isDarkMode ? '1px solid #374151' : '1px solid #CBD5E1',
      borderRadius: 2,
      padding: 20,
      boxShadow: 'none',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Section Header - matching ID/Conflict card design */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 8,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 0,
              background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
              border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.2)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className="ms-Icon ms-Icon--People" style={{ fontSize: 14, color: colours.highlight }} />
            </div>
            <div>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: isDarkMode ? '#E5E7EB' : '#0F172A',
              }}>
                Other Party & Conflict
              </div>
              <div style={{
                fontSize: 10,
                color: isDarkMode ? '#9CA3AF' : '#475569',
              }}>
                Enter opponent details for the conflict check and Clio contact record
              </div>
            </div>
          </div>
        </div>

        {/* Conflict of Interest Section - Using enhanced ConflictConfirmationCard */}
        <ConflictConfirmationCard
          clientName={clientName || 'Client'}
          matterDescription={matterDescription}
          opponentName={opponentFirst && opponentLast 
            ? `${opponentFirst} ${opponentLast}`.trim()
            : opponentName}
          opponentSolicitor={solicitorFirst && solicitorLast
            ? `${solicitorFirst} ${solicitorLast}`.trim()
            : opponentSolicitorName}
          noConflict={noConflict}
          onConflictStatusChange={setNoConflict}
          showOpponentSection={true}
          demoModeEnabled={demoModeEnabled}
        />

        {/* Opponent/solicitor details (Continue remains gated by conflict confirmation) */}
        <>
            {/* Opponent Type Selection */}
            <div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 8 
              }}>
                <span style={{ 
                  fontSize: 14, 
                  fontWeight: 600, 
                  color: isDarkMode ? '#E5E7EB' : '#0F172A'
                }}>
                  Who is the opponent?
                </span>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                gap: '12px'
              }}>
                {[ 
                  { type: 'Individual', icon: 'Contact' },
                  { type: 'Company', icon: 'CityNext' }
                ].map(({ type, icon }) => {
                  const isActive = opponentType === type;
                  return (
                    <button
                      key={type}
                      className={`client-type-icon-btn${isActive ? ' active' : ''}`}
                      type="button"
                      onClick={() => {
                        setOpponentType(type);
                        setEnterOpponentNow(true);
                        setShowSummary(false);
                        setVisibleSections({
                          opponent: {
                            name: type === 'Individual',
                            company: type === 'Company',
                            contact: false,
                            address: false,
                          },
                          solicitor: { name: false, contact: false, address: false, company: false },
                        });
                      }}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 14px',
                        border: `1px solid ${isActive ? '#3690CE' : (isDarkMode ? '#374151' : '#CBD5E1')}`,
                        borderRadius: 0,
                        background: isActive 
                          ? (isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.06)')
                          : (isDarkMode ? '#111827' : '#FFFFFF'),
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease',
                        minHeight: '56px',
                        boxShadow: 'none',
                        outline: 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.borderColor = '#3690CE';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.borderColor = isDarkMode ? '#374151' : '#CBD5E1';
                        }
                      }}
                    >
                      <div style={{
                        fontSize: '18px',
                        color: isActive ? '#3690CE' : (isDarkMode ? '#9CA3AF' : '#475569'),
                        marginBottom: '4px',
                      }}>
                        <i className={`ms-Icon ms-Icon--${icon}`} />
                      </div>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#3690CE' : (isDarkMode ? '#E5E7EB' : '#0F172A'),
                        textAlign: 'center',
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.5px',
                        lineHeight: 1.3,
                      }}>
                        {type}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <style>{`
                .opponent-type-selection .client-type-icon-btn {
                    transition: border-color 0.15s ease;
                }
            `}</style>

          {opponentType && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              margin: '0 0 12px 0',
            }}>
              {enterOpponentNow === true ? (
                <button
                  type="button"
                  onClick={() => {
                    setEnterOpponentNow(false);
                    if (setOpponentChoiceMade) setOpponentChoiceMade(true);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: isDarkMode ? '#9CA3AF' : '#475569',
                    textDecoration: 'underline',
                  }}
                >
                  I’ll add details later
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEnterOpponentNow(true);
                    setVisibleSections(prev => ({
                      opponent: {
                        ...prev.opponent,
                        name: opponentType === 'Individual',
                        company: opponentType === 'Company',
                      },
                      solicitor: prev.solicitor,
                    }));
                    if (setOpponentChoiceMade) setOpponentChoiceMade(true);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: isDarkMode ? '#E5E7EB' : '#0F172A',
                    textDecoration: 'underline',
                  }}
                >
                  Add opponent details
                </button>
              )}
            </div>
          )}
          
          {/* Only show details if user wants to enter them now */}
          {enterOpponentNow === true ? (
            <div>
              {/* ── ESSENTIAL FIELDS (always visible) ── */}
              <div style={containerStyle}>
                <Stack tokens={{ childrenGap: 10 }}>
                  {/* Opponent name — always shown, needed for conflict check */}
                  {opponentType === 'Company' ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                        Company Name
                      </div>
                      <Stack horizontal tokens={{ childrenGap: 5 }} style={{ width: "100%" }}>
                        <TextField
                          placeholder="Company Name"
                          value={_opponentCompanyName}
                          onChange={(_, v) => _setOpponentCompanyName(v || "")}
                          styles={{
                            root: { flex: 2, minWidth: 180, height: 38, ...getFieldStyle("opponentCompanyName", _opponentCompanyName) },
                            fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                            field: { color: fieldTextColor, background: "transparent" }
                          }}
                          onFocus={() => handleFieldFocus("opponentCompanyName")}
                          onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, opponentCompanyName: true })); }}
                        />
                        <TextField
                          placeholder="Company Number (optional)"
                          value={_opponentCompanyNumber}
                          onChange={(_, v) => _setOpponentCompanyNumber(v || "")}
                          onGetErrorMessage={() => getCompanyNumberErrorMessage(_opponentCompanyNumber, !!touchedFields["opponentCompanyNumber"])}
                          styles={{
                            root: { flex: 1, minWidth: 140, height: 38, ...getFieldStyle("opponentCompanyNumber", _opponentCompanyNumber) },
                            fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                            field: { color: fieldTextColor, background: "transparent" }
                          }}
                          onFocus={() => handleFieldFocus("opponentCompanyNumber")}
                          onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, opponentCompanyNumber: true })); }}
                        />
                      </Stack>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                        Opponent Name
                      </div>
                      <Stack horizontal tokens={{ childrenGap: 4 }} style={{ width: "100%" }}>
                        <Dropdown
                          placeholder="Title"
                          options={titleOptions}
                          selectedKey={_opponentTitle}
                          onChange={(_, o) => _setOpponentTitle(o?.key as string)}
                          styles={{
                            root: { flex: '0 0 auto', minWidth: 80, width: '18%', height: 38, alignSelf: 'flex-end', ...getFieldStyle("opponentTitle", _opponentTitle, true) },
                            dropdown: { borderRadius: 0, height: 38, background: "transparent", ...noFocusOutline },
                            title: { borderRadius: 0, height: 38, background: "transparent", color: fieldTextColor, display: 'flex', alignItems: 'center', ...noFocusOutline }
                          }}
                          calloutProps={{ styles: { calloutMain: { borderRadius: 0 } } }}
                          onFocus={() => handleFieldFocus("opponentTitle")}
                          onBlur={() => handleFieldBlur("opponentTitle")}
                        />
                        <TextField
                          placeholder="First Name"
                          value={_opponentFirst}
                          onChange={(_, v) => _setOpponentFirst(v || "")}
                          styles={{
                            root: { flex: '1 1 auto', minWidth: 100, height: 38, ...getFieldStyle("opponentFirst", _opponentFirst) },
                            fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                            field: { color: fieldTextColor, background: "transparent" }
                          }}
                          onFocus={() => handleFieldFocus("opponentFirst")}
                          onBlur={() => handleFieldBlur("opponentFirst")}
                        />
                        <TextField
                          placeholder="Last Name"
                          value={_opponentLast}
                          onChange={(_, v) => _setOpponentLast(v || "")}
                          styles={{
                            root: { flex: '1 1 auto', minWidth: 100, height: 38, ...getFieldStyle("opponentLast", _opponentLast) },
                            fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                            field: { color: fieldTextColor, background: "transparent" }
                          }}
                          onFocus={() => handleFieldFocus("opponentLast")}
                          onBlur={() => handleFieldBlur("opponentLast")}
                        />
                      </Stack>
                    </>
                  )}

                  {/* Solicitor firm — single field, always visible */}
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? '#9CA3AF' : '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4 }}>
                      Opposing Firm
                    </div>
                    <TextField
                      placeholder="Solicitor firm name (if known)"
                      value={opponentSolicitorCompany}
                      onChange={(_, v) => setOpponentSolicitorCompany(v || "")}
                      styles={{
                        root: { width: '100%', height: 38, ...getFieldStyle("opponentSolicitorCompany", opponentSolicitorCompany) },
                        fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                        field: { color: fieldTextColor, background: "transparent" }
                      }}
                      onFocus={() => handleFieldFocus("opponentSolicitorCompany")}
                      onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, opponentSolicitorCompany: true })); }}
                    />
                  </div>
                </Stack>
              </div>

              {/* ── ADDITIONAL DETAILS (single expandable section) ── */}
              {(() => {
                const showMore = visibleSections.opponent.contact; // reuse existing state as the "show more" toggle
                return (
                  <div style={{
                    ...containerStyle,
                    marginTop: 8,
                  }}>
                    <div
                      onClick={() => toggleSection('opponent', 'contact')}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection('opponent', 'contact'); } }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none' as const,
                        padding: '2px 0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="ms-Icon ms-Icon--AddTo" style={{ fontSize: 13, color: showMore ? colours.highlight : iconColor }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: isDarkMode ? '#E5E7EB' : '#0F172A' }}>
                          {showMore ? 'Additional details' : 'Add more details'}
                        </span>
                        <span style={{ fontSize: 12, color: isDarkMode ? '#6B7280' : '#94A3B8' }}>
                          · contact, address, solicitor details
                        </span>
                      </div>
                      <i className="ms-Icon ms-Icon--ChevronDown" style={{ fontSize: 10, color: isDarkMode ? '#6B7280' : '#94A3B8', transition: 'transform 0.2s ease', transform: showMore ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </div>

                    {showMore && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* ── Opponent Contact ── */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#6B7280' : '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4 }}>
                            Opponent Contact
                          </div>
                          <Stack horizontal tokens={{ childrenGap: 4 }} style={{ width: "100%" }}>
                            <TextField
                              placeholder="Email"
                              value={_opponentEmail}
                              onChange={(_, v) => _setOpponentEmail(v || "")}
                              onGetErrorMessage={() => getEmailErrorMessage(_opponentEmail, !!touchedFields["opponentEmail"])}
                              styles={{
                                root: { flex: 1, minWidth: 0, height: 38, ...getFieldStyle("opponentEmail", _opponentEmail) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("opponentEmail")}
                              onBlur={() => handleFieldBlur("opponentEmail")}
                            />
                            <TextField
                              placeholder="Phone"
                              value={_opponentPhone}
                              onChange={(_, v) => _setOpponentPhone(v || "")}
                              onGetErrorMessage={() => getPhoneErrorMessage(_opponentPhone, !!touchedFields["opponentPhone"])}
                              styles={{
                                root: { flex: 1, minWidth: 0, height: 38, ...getFieldStyle("opponentPhone", _opponentPhone) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("opponentPhone")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, opponentPhone: true })); }}
                            />
                          </Stack>
                        </div>

                        {/* ── Opponent Address ── */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#6B7280' : '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>
                              {opponentType === 'Company' ? 'Company Address' : 'Opponent Address'}
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 5 }}>
                            <TextField
                              placeholder="House/Building"
                              value={opponentType === 'Company' ? displayValue("opponentCompanyHouseNumber", _opponentCompanyHouseNumber) : _opponentHouseNumber}
                              onChange={(_, v) => opponentType === 'Company' ? _setOpponentCompanyHouseNumber(v || "") : _setOpponentHouseNumber(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle(opponentType === 'Company' ? "opponentCompanyHouseNumber" : "opponentHouseNumber", opponentType === 'Company' ? _opponentCompanyHouseNumber : _opponentHouseNumber) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus(opponentType === 'Company' ? "opponentCompanyHouseNumber" : "opponentHouseNumber")}
                              onBlur={() => setTouchedFields(prev => ({ ...prev, [opponentType === 'Company' ? "opponentCompanyHouseNumber" : "opponentHouseNumber"]: true }))}
                            />
                            <TextField
                              placeholder="Street"
                              value={opponentType === 'Company' ? displayValue("opponentCompanyStreet", _opponentCompanyStreet) : _opponentStreet}
                              onChange={(_, v) => opponentType === 'Company' ? _setOpponentCompanyStreet(v || "") : _setOpponentStreet(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle(opponentType === 'Company' ? "opponentCompanyStreet" : "opponentStreet", opponentType === 'Company' ? _opponentCompanyStreet : _opponentStreet) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus(opponentType === 'Company' ? "opponentCompanyStreet" : "opponentStreet")}
                              onBlur={() => setTouchedFields(prev => ({ ...prev, [opponentType === 'Company' ? "opponentCompanyStreet" : "opponentStreet"]: true }))}
                            />
                            <TextField
                              placeholder="City/Town"
                              value={opponentType === 'Company' ? displayValue("opponentCompanyCity", _opponentCompanyCity) : _opponentCity}
                              onChange={(_, v) => opponentType === 'Company' ? _setOpponentCompanyCity(v || "") : _setOpponentCity(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle(opponentType === 'Company' ? "opponentCompanyCity" : "opponentCity", opponentType === 'Company' ? _opponentCompanyCity : _opponentCity) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus(opponentType === 'Company' ? "opponentCompanyCity" : "opponentCity")}
                              onBlur={() => setTouchedFields(prev => ({ ...prev, [opponentType === 'Company' ? "opponentCompanyCity" : "opponentCity"]: true }))}
                            />
                            <TextField
                              placeholder="County"
                              value={opponentType === 'Company' ? displayValue("opponentCompanyCounty", _opponentCompanyCounty) : _opponentCounty}
                              onChange={(_, v) => opponentType === 'Company' ? _setOpponentCompanyCounty(v || "") : _setOpponentCounty(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle(opponentType === 'Company' ? "opponentCompanyCounty" : "opponentCounty", opponentType === 'Company' ? _opponentCompanyCounty : _opponentCounty) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus(opponentType === 'Company' ? "opponentCompanyCounty" : "opponentCounty")}
                              onBlur={() => setTouchedFields(prev => ({ ...prev, [opponentType === 'Company' ? "opponentCompanyCounty" : "opponentCounty"]: true }))}
                            />
                            <TextField
                              placeholder="Post Code"
                              value={opponentType === 'Company' ? displayValue("opponentCompanyPostcode", _opponentCompanyPostcode) : _opponentPostcode}
                              onChange={(_, v) => opponentType === 'Company' ? _setOpponentCompanyPostcode(v || "") : _setOpponentPostcode(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle(opponentType === 'Company' ? "opponentCompanyPostcode" : "opponentPostcode", opponentType === 'Company' ? _opponentCompanyPostcode : _opponentPostcode) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus(opponentType === 'Company' ? "opponentCompanyPostcode" : "opponentPostcode")}
                              onBlur={() => setTouchedFields(prev => ({ ...prev, [opponentType === 'Company' ? "opponentCompanyPostcode" : "opponentPostcode"]: true }))}
                            />
                            <Dropdown
                              placeholder="Country"
                              options={countries.map((c: { name: string; code: string }) => ({ key: c.name, text: `${c.name} (${c.code})` }))}
                              selectedKey={opponentType === 'Company' ? displaySelectKey("opponentCompanyCountry", _opponentCompanyCountry) : _opponentCountry}
                              onChange={(_, o) => opponentType === 'Company' ? _setOpponentCompanyCountry(o?.key as string || "") : _setOpponentCountry(o?.key as string || "")}
                              styles={{
                                root: { height: 38, alignSelf: 'flex-end', ...getFieldStyle(opponentType === 'Company' ? "opponentCompanyCountry" : "opponentCountry", String(opponentType === 'Company' ? (displaySelectKey("opponentCompanyCountry", _opponentCompanyCountry) ?? "") : (_opponentCountry ?? "")), true) },
                                dropdown: { borderRadius: 0, height: 38, background: "transparent", ...noFocusOutline },
                                title: { borderRadius: 0, height: 38, background: "transparent", color: fieldTextColor, display: 'flex', alignItems: 'center', ...noFocusOutline }
                              }}
                              calloutProps={{ styles: { calloutMain: { borderRadius: 0 } } }}
                              onFocus={() => handleFieldFocus(opponentType === 'Company' ? "opponentCompanyCountry" : "opponentCountry")}
                              onBlur={() => setTouchedFields(prev => ({ ...prev, [opponentType === 'Company' ? "opponentCompanyCountry" : "opponentCountry"]: true }))}
                            />
                          </div>
                        </div>

                        {/* ── Solicitor Details ── */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#6B7280' : '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4 }}>
                            Opponent's Solicitor — Name & Contact
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 4, marginBottom: 6 }}>
                            <Dropdown
                              placeholder="Title"
                              options={titleOptions}
                              selectedKey={_solicitorTitle}
                              onChange={(_, o) => _setSolicitorTitle(o?.key as string)}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorTitle", _solicitorTitle, true) },
                                dropdown: { borderRadius: 0, height: 38, background: "transparent", ...noFocusOutline },
                                title: { borderRadius: 0, height: 38, background: "transparent", color: fieldTextColor, display: 'flex', alignItems: 'center', ...noFocusOutline }
                              }}
                              calloutProps={{ styles: { calloutMain: { borderRadius: 0 } } }}
                              onFocus={() => handleFieldFocus("solicitorTitle")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorTitle: true })); }}
                            />
                            <TextField
                              placeholder="First Name"
                              value={_solicitorFirst}
                              onChange={(_, v) => _setSolicitorFirst(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorFirst", _solicitorFirst) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorFirst")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorFirst: true })); }}
                            />
                            <TextField
                              placeholder="Last Name"
                              value={_solicitorLast}
                              onChange={(_, v) => _setSolicitorLast(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorLast", _solicitorLast) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorLast")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorLast: true })); }}
                            />
                          </div>
                          <Stack horizontal tokens={{ childrenGap: 4 }} style={{ width: "100%" }}>
                            <TextField
                              placeholder="Email"
                              value={_opponentSolicitorEmail}
                              onChange={(_, v) => _setOpponentSolicitorEmail(v || "")}
                              styles={{
                                root: { flex: 1, height: 38, ...getFieldStyle("opponentSolicitorEmail", _opponentSolicitorEmail) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("opponentSolicitorEmail")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, opponentSolicitorEmail: true })); }}
                            />
                            <TextField
                              placeholder="Phone"
                              value={_solicitorPhone}
                              onChange={(_, v) => _setSolicitorPhone(v || "")}
                              styles={{
                                root: { flex: 1, height: 38, ...getFieldStyle("solicitorPhone", _solicitorPhone) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorPhone")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorPhone: true })); }}
                            />
                          </Stack>
                        </div>

                        {/* ── Solicitor Address ── */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#6B7280' : '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4 }}>
                            Opponent's Solicitor — Address
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(140px, 1fr))", gap: 5 }}>
                            <TextField
                              placeholder="House/Building"
                              value={_solicitorHouseNumber}
                              onChange={(_, v) => _setSolicitorHouseNumber(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorHouseNumber", _solicitorHouseNumber) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorHouseNumber")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorHouseNumber: true })); }}
                            />
                            <TextField
                              placeholder="Street"
                              value={_solicitorStreet}
                              onChange={(_, v) => _setSolicitorStreet(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorStreet", _solicitorStreet) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorStreet")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorStreet: true })); }}
                            />
                            <TextField
                              placeholder="City/Town"
                              value={_solicitorCity}
                              onChange={(_, v) => _setSolicitorCity(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorCity", _solicitorCity) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorCity")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorCity: true })); }}
                            />
                            <TextField
                              placeholder="County"
                              value={_solicitorCounty}
                              onChange={(_, v) => _setSolicitorCounty(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorCounty", _solicitorCounty) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorCounty")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorCounty: true })); }}
                            />
                            <TextField
                              placeholder="Post Code"
                              value={_solicitorPostcode}
                              onChange={(_, v) => _setSolicitorPostcode(v || "")}
                              styles={{
                                root: { height: 38, ...getFieldStyle("solicitorPostcode", _solicitorPostcode) },
                                fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none" },
                                field: { color: fieldTextColor, background: "transparent" }
                              }}
                              onFocus={() => handleFieldFocus("solicitorPostcode")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorPostcode: true })); }}
                            />
                            <Dropdown
                              placeholder="Country"
                              options={countries.map((c: { name: string; code: string }) => ({ key: c.name, text: `${c.name} (${c.code})` }))}
                              selectedKey={_solicitorCountry}
                              onChange={(_, o) => _setSolicitorCountry(o?.key as string || "")}
                              styles={{
                                root: { height: 38, alignSelf: 'flex-end', ...getFieldStyle("solicitorCountry", _solicitorCountry, true) },
                                dropdown: { borderRadius: 0, height: 38, background: "transparent", ...noFocusOutline },
                                title: { borderRadius: 0, height: 38, background: "transparent", color: fieldTextColor, display: 'flex', alignItems: 'center', ...noFocusOutline }
                              }}
                              calloutProps={{ styles: { calloutMain: { borderRadius: 0 } } }}
                              onFocus={() => handleFieldFocus("solicitorCountry")}
                              onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorCountry: true })); }}
                            />
                          </div>
                        </div>

                        {/* Company contact person (when opponent is Company) */}
                        {opponentType === 'Company' && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#6B7280' : '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4 }}>
                              Opponent Company — Key Contact
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 4, marginBottom: 6 }}>
                              <Dropdown
                                placeholder="Title"
                                options={titleOptions}
                                selectedKey={_opponentTitle}
                                onChange={(_, o) => _setOpponentTitle(o?.key as string)}
                                styles={{
                                  root: { height: 38, ...getFieldStyle("opponentTitle", _opponentTitle, true) },
                                  dropdown: { borderRadius: 0, height: 38, background: "transparent", ...noFocusOutline },
                                  title: { borderRadius: 0, height: 38, background: "transparent", color: fieldTextColor, display: 'flex', alignItems: 'center', ...noFocusOutline }
                                }}
                                calloutProps={{ styles: { calloutMain: { borderRadius: 0 } } }}
                                onFocus={() => handleFieldFocus("opponentTitle")}
                                onBlur={() => handleFieldBlur("opponentTitle")}
                              />
                              <TextField
                                placeholder="First Name"
                                value={_opponentFirst}
                                onChange={(_, v) => _setOpponentFirst(v || "")}
                                styles={{
                                  root: { height: 38, ...getFieldStyle("opponentFirst", _opponentFirst) },
                                  fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                  field: { color: fieldTextColor, background: "transparent" }
                                }}
                                onFocus={() => handleFieldFocus("opponentFirst")}
                                onBlur={() => handleFieldBlur("opponentFirst")}
                              />
                              <TextField
                                placeholder="Last Name"
                                value={_opponentLast}
                                onChange={(_, v) => _setOpponentLast(v || "")}
                                styles={{
                                  root: { height: 38, ...getFieldStyle("opponentLast", _opponentLast) },
                                  fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                  field: { color: fieldTextColor, background: "transparent" }
                                }}
                                onFocus={() => handleFieldFocus("opponentLast")}
                                onBlur={() => handleFieldBlur("opponentLast")}
                              />
                            </div>
                            <Stack horizontal tokens={{ childrenGap: 4 }} style={{ width: "100%" }}>
                              <TextField
                                placeholder="Email"
                                value={_opponentEmail}
                                onChange={(_, v) => _setOpponentEmail(v || "")}
                                styles={{
                                  root: { flex: 1, height: 38, ...getFieldStyle("opponentEmail", _opponentEmail) },
                                  fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                  field: { color: fieldTextColor, background: "transparent" }
                                }}
                                onFocus={() => handleFieldFocus("opponentEmail")}
                                onBlur={() => handleFieldBlur("opponentEmail")}
                              />
                              <TextField
                                placeholder="Phone"
                                value={_opponentPhone}
                                onChange={(_, v) => _setOpponentPhone(v || "")}
                                styles={{
                                  root: { flex: 1, height: 38, ...getFieldStyle("opponentPhone", _opponentPhone) },
                                  fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                                  field: { color: fieldTextColor, background: "transparent" }
                                }}
                                onFocus={() => handleFieldFocus("opponentPhone")}
                                onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, opponentPhone: true })); }}
                              />
                            </Stack>
                          </div>
                        )}

                        {/* Solicitor company number */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#6B7280' : '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 4 }}>
                            Opponent's Solicitor — Firm Number
                          </div>
                          <TextField
                            placeholder="Company Number"
                            value={_solicitorCompanyNumber}
                            onChange={(_, v) => _setSolicitorCompanyNumber(v || "")}
                            styles={{
                              root: { width: '50%', height: 38, ...getFieldStyle("solicitorCompanyNumber", _solicitorCompanyNumber) },
                              fieldGroup: { borderRadius: 0, height: 38, background: "transparent", border: "none", ...noFocusOutline },
                              field: { color: fieldTextColor, background: "transparent" }
                            }}
                            onFocus={() => handleFieldFocus("solicitorCompanyNumber")}
                            onBlur={() => { setActiveField(null); setTouchedFields(prev => ({ ...prev, solicitorCompanyNumber: true })); }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
          </div>
        ) : enterOpponentNow === false ? (
          <div
            style={{
              background: isDarkMode ? 'rgba(15, 23, 42, 0.35)' : 'rgba(248, 250, 252, 0.9)',
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(0, 0, 0, 0.08)'}`,
              borderRadius: 2,
              padding: '12px 14px',
              marginBottom: 16,
              color: isDarkMode ? '#E5E7EB' : '#0F172A',
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <i className="ms-Icon ms-Icon--SkypeCheck" style={{ fontSize: 14, color: '#22C55E' }} />
              <span style={{ fontWeight: 700 }}>No opponent details yet</span>
            </div>
            <div style={{ color: isDarkMode ? '#9CA3AF' : '#475569', fontSize: 12 }}>
              You can complete opponent and solicitor details from the matter workbench after the matter is opened.
            </div>
          </div>
        ) : null}
        </>

        {onContinue && (
          <PrimaryButton
            onClick={onContinue}
            disabled={!noConflict}
            styles={{
              root: {
                background: '#3690CE',
                border: 'none',
                borderRadius: 0,
                height: 40,
                fontWeight: 700,
                fontSize: 13,
                textTransform: 'uppercase' as any,
                letterSpacing: '0.5px',
                boxShadow: 'none',
                ':hover': {
                  background: '#2563EB',
                },
                ':active': {
                  background: '#1D4ED8',
                }
              }
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Continue to Matter Details
              <i className="ms-Icon ms-Icon--ChevronRight" style={{ fontSize: 11 }} />
            </span>
          </PrimaryButton>
        )}
      </div>
    </div>
  );
};

export default OpponentDetailsStep;
