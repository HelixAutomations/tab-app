// src/tabs/matters/Matters.tsx

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  MessageBar,
  MessageBarType,
  Link,
  IconButton,
  PrimaryButton,
  DefaultButton,
  Modal,
  Icon,
  SearchBox,
  Dropdown,
  IDropdownOption,
  Spinner,
  SpinnerSize,
  initializeIcons,
} from '@fluentui/react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts';
import { parseISO, startOfMonth, format, isValid } from 'date-fns';
import { Matter, UserData } from '../../app/functionality/types';
import MatterCard from './MatterCard';
import MatterOverview from './MatterOverview';
import AreaCountCard from './AreaCountCard';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { Pivot, PivotItem } from '@fluentui/react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

initializeIcons();

// Styles
const containerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    maxWidth: '100%',
    minHeight: '100vh',
    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
    display: 'flex',
    flexDirection: 'column',
    transition: 'background-color 0.3s',
    fontFamily: 'Raleway, sans-serif',
  });

const headerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    paddingTop: '0px',
    paddingBottom: '20px',
  });

const mainContentStyle = (isDarkMode: boolean) =>
  mergeStyles({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    paddingBottom: '40px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.background,
    transition: 'background-color 0.3s',
  });

const footerStyle = (isDarkMode: boolean) =>
  mergeStyles({
    padding: '20px',
    backgroundColor: isDarkMode ? colours.dark.sectionBackground : colours.light.border,
    borderRadius: '8px',
    marginTop: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    color: isDarkMode ? colours.dark.text : colours.light.text,
    fontSize: '14px',
    fontFamily: 'Raleway, sans-serif',
  });

// Define action button styles
const actionButtonStyle = {
  root: {
    marginRight: '8px',
    backgroundColor: colours.cta, // CTA red color
    borderRadius: '8px',
    transition: 'background-color 0.3s, transform 0.3s',
    selectors: {
      ':hover': {
        backgroundColor: colours.red, // Darker red on hover
        transform: 'scale(1.05)',
      },
    },
  },
  label: {
    color: 'white',
    fontWeight: '600',
  },
};

// Define the Matters Component
interface MattersProps {
  matters: Matter[];
  isLoading: boolean;
  error: string | null;
  userData: UserData[] | null;
  fetchMatters: (fullName: string) => Promise<Matter[]>;
}

const Matters: React.FC<MattersProps> = ({ matters, isLoading, error, userData, fetchMatters }) => {
  console.log('Matters Props:', { matters, isLoading, error, userData }); // Debugging

  const { isDarkMode } = useTheme();
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterPracticeArea, setFilterPracticeArea] = useState<string>('All');
  const [filterOriginatingSolicitor, setFilterOriginatingSolicitor] = useState<string>('All');
  const [isSuccessVisible, setIsSuccessVisible] = useState<boolean>(false);

  // Added for infinite scroll
  const [itemsToShow, setItemsToShow] = useState<number>(20);
  const loader = useRef<HTMLDivElement | null>(null);

  // Extract unique PracticeAreas
  const practiceAreas = useMemo(() => {
    const areas = new Set<string>();
    matters.forEach((matter) => {
      if (matter.PracticeArea) {
        areas.add(matter.PracticeArea);
      }
    });
    return Array.from(areas);
  }, [matters]);

  // Extract unique OriginatingSolicitors
  const originatingSolicitors = useMemo(() => {
    const solics = new Set<string>();
    matters.forEach((matter) => {
      if (matter.OriginatingSolicitor) {
        solics.add(matter.OriginatingSolicitor);
      }
    });
    return Array.from(solics);
  }, [matters]);

  // Search and filter matters
  const filteredMatters = useMemo(() => {
    let filtered = matters;

    // Filter by PracticeArea
    if (filterPracticeArea !== 'All') {
      filtered = filtered.filter((matter) => matter.PracticeArea === filterPracticeArea);
    }

    // Filter by OriginatingSolicitor
    if (filterOriginatingSolicitor === 'Mine') {
      const fullName = userData && `${userData[0].First} ${userData[0].Last}`;
      filtered = filtered.filter((matter) => matter.OriginatingSolicitor === fullName);
    } else if (filterOriginatingSolicitor !== 'All') {
      filtered = filtered.filter((matter) => matter.OriginatingSolicitor === filterOriginatingSolicitor);
    }

    // Search filter
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (matter) =>
          matter.ClientName?.toLowerCase().includes(lowerSearchTerm) ||
          matter.ClientID?.toLowerCase().includes(lowerSearchTerm) ||
          matter.PracticeArea?.toLowerCase().includes(lowerSearchTerm)
      );
    }

    return filtered;
  }, [matters, searchTerm, filterPracticeArea, filterOriginatingSolicitor, userData]);

  // Infinite scroll calculations
  const displayedMatters = useMemo(() => {
    return filteredMatters.slice(0, itemsToShow);
  }, [filteredMatters, itemsToShow]);

  const handleLoadMore = useCallback(() => {
    setItemsToShow((prev) => Math.min(prev + 20, filteredMatters.length));
  }, [filteredMatters.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      {
        root: null,
        rootMargin: '200px', // Increased margin to trigger earlier
        threshold: 0.1, // Trigger as soon as the loader is slightly visible
      }
    );

    // Delay observer setup slightly to allow state updates
    const timeoutId = setTimeout(() => {
      if (loader.current) {
        observer.observe(loader.current);
      }
    }, 100); // Small delay ensures `filteredMatters` is set before attaching

    return () => {
      clearTimeout(timeoutId);
      if (loader.current) {
        observer.unobserve(loader.current);
      }
    };
  }, [filteredMatters, handleLoadMore]);

  // Handler to select a matter
  const handleSelectMatter = useCallback((matter: Matter) => {
    setSelectedMatter(matter);
  }, []);

  // Handler to go back to the list
  const handleBackToList = useCallback(() => {
    setSelectedMatter(null);
  }, []);

  // Define filter options for OriginatingSolicitor
  const originatingSolicitorOptions: IDropdownOption[] = useMemo(() => {
    return ['All', 'Mine', ...originatingSolicitors].map((solicitor) => ({
      key: solicitor,
      text: solicitor,
    }));
  }, [originatingSolicitors]);

  // Define filter options for PracticeArea
  const practiceAreaOptions: IDropdownOption[] = useMemo(() => {
    return ['All', ...practiceAreas].map((area) => ({
      key: area,
      text: area,
    }));
  }, [practiceAreas]);

  // Implement PracticeArea Counts
  const practiceAreaCounts = useMemo(() => {
    const counts: { [practiceArea: string]: number } = {};
    matters.forEach((matter) => {
      if (matter.PracticeArea) {
        if (!counts[matter.PracticeArea]) {
          counts[matter.PracticeArea] = 0;
        }
        counts[matter.PracticeArea]++;
      }
    });
    return counts;
  }, [matters]);

  // Implement OriginatingSolicitor Counts
  const originatingSolicitorCounts = useMemo(() => {
    const counts: { [solicitor: string]: number } = {};
    matters.forEach((matter) => {
      if (matter.OriginatingSolicitor) {
        counts[matter.OriginatingSolicitor] = (counts[matter.OriginatingSolicitor] || 0) + 1;
      }
    });
    return counts;
  }, [matters]);

  // Implement Date Range Slider based on OpenDate
  const sortedMattersByDate = useMemo(() => {
    return [...matters].sort((a, b) => {
      const dateA = parseISO(a.OpenDate || '');
      const dateB = parseISO(b.OpenDate || '');
      return dateA.getTime() - dateB.getTime();
    });
  }, [matters]);

  const validDates = useMemo(() => {
    return sortedMattersByDate
      .map((matter) => matter.OpenDate)
      .filter((d): d is string => typeof d === 'string' && isValid(parseISO(d)))
      .map((d) => parseISO(d));
  }, [sortedMattersByDate]);

  const [dateRange, setDateRange] = useState<{ oldest: string; newest: string } | null>(null);
  const [currentSliderStart, setCurrentSliderStart] = useState<number>(0);
  const [currentSliderEnd, setCurrentSliderEnd] = useState<number>(0);

  useEffect(() => {
    if (validDates.length > 0) {
      const oldestDate = new Date(Math.min(...validDates.map((date) => date.getTime())));
      const newestDate = new Date(Math.max(...validDates.map((date) => date.getTime())));
      setDateRange({
        oldest: format(oldestDate, 'dd MMM yyyy'),
        newest: format(newestDate, 'dd MMM yyyy'),
      });
      setCurrentSliderStart(0);
      setCurrentSliderEnd(validDates.length - 1);
    } else {
      setDateRange(null);
    }
  }, [validDates]);

  const enquiriesInSliderRange = useMemo(() => {
    return sortedMattersByDate.slice(currentSliderStart, currentSliderEnd + 1);
  }, [sortedMattersByDate, currentSliderStart, currentSliderEnd]);

  // Counts based on distinct UniqueID
  const uniqueMattersCount = useMemo(() => {
    const uniqueIDs = new Set<string>();
    enquiriesInSliderRange.forEach((matter) => {
      if (matter.UniqueID) {
        uniqueIDs.add(matter.UniqueID);
      }
    });
    return uniqueIDs.size;
  }, [enquiriesInSliderRange]);

  // Implement Charts based on OpenDate
  const monthlyMatterCounts = useMemo(() => {
    const counts: { [month: string]: { [PracticeArea: string]: number } } = {};
    enquiriesInSliderRange.forEach((matter) => {
      if (matter.OpenDate && matter.PracticeArea) {
        const date = parseISO(matter.OpenDate);
        if (!isValid(date)) return;
        const monthStart = startOfMonth(date);
        const monthLabel = format(monthStart, 'MMM yyyy');

        if (!counts[monthLabel]) {
          counts[monthLabel] = {};
        }

        counts[monthLabel][matter.PracticeArea] = (counts[monthLabel][matter.PracticeArea] || 0) + 1;
      }
    });

    const sortedMonths = Object.keys(counts).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime()
    );

    return sortedMonths.map((month) => ({
      month,
      ...counts[month],
    }));
  }, [enquiriesInSliderRange]);

  const renderCustomLegend = useCallback(
    (props: any) => {
      const { payload } = props;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', fontFamily: 'Raleway, sans-serif' }}>
          {payload.map((entry: any, index: number) => (
            <div
              key={`legend-item-${index}`}
              style={{ display: 'flex', alignItems: 'center', marginRight: 20 }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: areaColor(entry.value),
                  marginRight: 8,
                }}
              />
              <span
                style={{
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                  fontWeight: 500,
                }}
              >
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      );
    },
    [isDarkMode]
  );

  return (
    <div className={containerStyle(isDarkMode)}>
      {/* Header: Search and Filter Controls */}
      <div className={headerStyle(isDarkMode)}>
        <Stack horizontal tokens={{ childrenGap: 12 }} verticalAlign="center">
          {/* Search Box */}
          <div
            className={mergeStyles({
              flexGrow: 1,
              marginRight: '12px',
            })}
          >
            <SearchBox
              placeholder="Search matters..."
              value={searchTerm}
              onChange={(_, newValue) => setSearchTerm(newValue || '')}
              styles={{
                root: {
                  width: '100%',
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  borderColor: isDarkMode ? colours.dark.border : colours.light.border,
                  borderRadius: '4px',
                },
                field: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
              ariaLabel="Search Matters"
            />
          </div>

          {/* PracticeArea Filter Dropdown */}
          <div>
            <Dropdown
              placeholder="Filter by Practice Area"
              options={practiceAreaOptions}
              selectedKey={filterPracticeArea}
              onChange={(event: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
                setFilterPracticeArea(option?.key as string);
                setItemsToShow(20); // Reset to initial batch
              }}
              styles={{
                root: {
                  width: 200,
                },
                dropdown: {
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  borderColor: isDarkMode ? colours.dark.border : colours.light.border,
                },
                title: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
                caretDown: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
              ariaLabel="Filter Matters by Practice Area"
            />
          </div>

          {/* OriginatingSolicitor Filter Dropdown */}
          <div>
            <Dropdown
              placeholder="Filter by Originating Solicitor"
              options={originatingSolicitorOptions}
              selectedKey={filterOriginatingSolicitor}
              onChange={(event: React.FormEvent<HTMLDivElement>, option?: IDropdownOption) => {
                setFilterOriginatingSolicitor(option?.key as string);
                setItemsToShow(20); // Reset to initial batch
              }}
              styles={{
                root: {
                  width: 200,
                },
                dropdown: {
                  backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                  borderColor: isDarkMode ? colours.dark.border : colours.light.border,
                },
                title: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
                caretDown: {
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                },
              }}
              ariaLabel="Filter Matters by Originating Solicitor"
            />
          </div>
        </Stack>
      </div>

      {/* Main Content */}
      <main className={mainContentStyle(isDarkMode)}>
        {isLoading ? (
          <Spinner label="Loading matters..." size={SpinnerSize.medium} ariaLive="assertive" />
        ) : error ? (
          <MessageBar messageBarType={MessageBarType.error} isMultiline={false}>
            {error}
          </MessageBar>
        ) : selectedMatter ? (
          <MatterOverview matter={selectedMatter} onEdit={handleBackToList} />
        ) : (
          <>
            {filteredMatters.length === 0 ? (
              <Text
                variant="medium"
                styles={{
                  root: {
                    color: isDarkMode ? colours.dark.subText : colours.light.subText,
                    fontFamily: 'Raleway, sans-serif',
                  },
                }}
              >
                No matters found matching your criteria.
              </Text>
            ) : (
              <>
                {/* Matters Grid */}
                <div
                  className={mergeStyles({
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)', // 4 cards per row
                    gap: '20px',
                    // Responsive adjustments
                    '@media (max-width: 1200px)': {
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    },
                    '@media (max-width: 900px)': {
                      gridTemplateColumns: 'repeat(1, 1fr)',
                    },
                  })}
                >
                  {displayedMatters.map((matter, index) => {
                    const row = Math.floor(index / 4);
                    const col = index % 4;
                    const animationDelay = row * 0.2 + col * 0.1;
                    return (
                      <MatterCard
                        key={matter.UniqueID}
                        matter={matter}
                        onSelect={handleSelectMatter}
                        animationDelay={animationDelay}
                      />
                    );
                  })}
                </div>
                {/* Loader for Infinite Scroll */}
                <div ref={loader} />
              </>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className={footerStyle(isDarkMode)}>
        <Text>
          <Link
            href="https://helix-law.co.uk/"
            target="_blank"
            styles={{
              root: {
                color: colours.highlight,
                fontSize: '12px',
                fontFamily: 'Raleway, sans-serif',
              },
            }}
            ariaLabel="Helix Law Website"
          >
            https://helix-law.co.uk/
          </Link>
          {' | '}
          <Text variant="small" styles={{ root: { color: isDarkMode ? colours.dark.text : colours.light.text, display: 'inline' } }}>
            01273 761990
          </Text>
        </Text>
        <Text
          styles={{
            root: {
              fontSize: '12px',
              fontFamily: 'Raleway, sans-serif',
              color: isDarkMode ? colours.dark.text : colours.light.subText,
            },
          }}
        >
          Second Floor, Britannia House, 21 Station Street, Brighton, BN1 4DE
        </Text>
      </footer>

      {/* Success Message */}
      {isSuccessVisible && (
        <MessageBar
          messageBarType={MessageBarType.success}
          isMultiline={false}
          onDismiss={() => setIsSuccessVisible(false)}
          dismissButtonAriaLabel="Close"
          styles={{
            root: {
              position: 'fixed',
              bottom: 20,
              right: 20,
              maxWidth: '300px',
              zIndex: 1000,
              borderRadius: '4px',
              fontFamily: 'Raleway, sans-serif',
            },
          }}
        >
          Action completed successfully!
        </MessageBar>
      )}

      {/* Modal for Matter Details */}
      <Modal
        isOpen={selectedMatter !== null}
        onDismiss={handleBackToList}
        isBlocking={false}
        containerClassName={mergeStyles({
          maxWidth: 800,
          padding: '30px',
          borderRadius: '12px',
          backgroundColor: isDarkMode
            ? colours.dark.sectionBackground
            : colours.light.sectionBackground,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          fontFamily: 'Raleway, sans-serif',
        })}
        styles={{ main: { maxWidth: '800px', margin: 'auto' } }}
        aria-labelledby="matter-modal"
      >
        {selectedMatter && (
          <Stack tokens={{ childrenGap: 20 }}>
            <Stack
              horizontal
              horizontalAlign="space-between"
              verticalAlign="center"
              className={mergeStyles({ marginBottom: '20px' })}
            >
              <IconButton
                iconProps={{ iconName: 'Back' }}
                title="Back to Matters"
                ariaLabel="Back to Matters"
                onClick={handleBackToList}
                styles={{
                  root: {
                    backgroundColor: isDarkMode ? colours.dark.background : colours.light.background,
                    color: isDarkMode ? colours.dark.iconColor : colours.light.iconColor,
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    selectors: {
                      ':hover': {
                        backgroundColor: isDarkMode
                          ? colours.dark.background
                          : colours.light.background,
                      },
                    },
                  },
                }}
              />
              <div style={{ width: '40px' }}></div>
            </Stack>
            {/* Display the Matter Overview */}
            <MatterOverview matter={selectedMatter} onEdit={handleBackToList} />
          </Stack>
        )}
      </Modal>
    </div>
  );
};

// Helper function for area color
const areaColor = (area?: string): string => {
  const normalizedArea = area?.toLowerCase() || '';
  switch (normalizedArea) {
    case 'commercial':
      return colours.blue;
    case 'construction':
      return colours.orange;
    case 'property':
      return colours.green;
    case 'employment':
      return colours.yellow;
    default:
      return colours.cta;
  }
};

export default Matters;
