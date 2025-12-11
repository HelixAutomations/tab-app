// src/tabs/matters/documents/Documents.tsx

import React, { useState, useMemo, useEffect } from 'react';
import {
  Stack,
  Text,
  mergeStyles,
  Icon,
  Link,
  SearchBox,
} from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';
import documentIndex, { DocumentEntry } from './documentIndex';
import { Matter } from '../../../app/functionality/types';
import DocumentCard from './DocumentCard';
import DocumentDetailsPage from './DocumentDetailsPage'; // Use full-page details instead of PromptPane

/* 
============================================================================== 
                          Interface & Prop Definitions 
============================================================================== 
*/

interface DocumentsProps {
  matter?: Matter;
  category: "Commercial" | "Construction" | "Employment" | "Property" | "Miscellaneous";
}

/* 
============================================================================== 
                              Styling 
============================================================================== 
*/

// Instead of forcing a full-page white background,
// we now use a minimal container style.
const containerStyle = mergeStyles({
  padding: '16px 0', // Just vertical spacing, so it fits inside the outer matter card.
  fontFamily: 'Raleway, sans-serif',
});

// Header container: retains its own style for the display number and search.
const headerContainerStyle = mergeStyles({
  padding: '10px 20px',
  borderRadius: 0,
  backgroundColor: '#fff',
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  marginBottom: '20px',
});

// Grid style for document cards (max 3 per row)
const gridStyle = mergeStyles({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '32px',
  marginTop: '32px',
});

// New styles for the search container (mimicking MattersCombinedMenu)
const searchContainerStyle = mergeStyles({ display: 'flex', alignItems: 'center', gap: '8px' });
const searchIconStyle = mergeStyles({ cursor: 'pointer' });
const searchBoxStyles = (isSearchActive: boolean) =>
  mergeStyles({
    width: isSearchActive ? '180px' : '0px',
    opacity: isSearchActive ? 1 : 0,
    transition: 'width 0.3s, opacity 0.3s',
    overflow: 'hidden',
  });

// Styles for dummy document content simulation
const dummyContentStyle = mergeStyles({
  backgroundColor: '#ccc',
  borderRadius: '4px',
  padding: '10px',
  marginTop: '8px',
  height: '120px',
  position: 'relative',
});
const dummyFieldStyle = mergeStyles({
  backgroundColor: '#fff',
  height: '12px',
  width: '80%',
  borderRadius: '2px',
  marginBottom: '8px',
});

/* 
============================================================================== 
                              Main Component 
============================================================================== 
*/

const Documents: React.FC<DocumentsProps> = ({ matter, category }) => {
  const { isDarkMode } = useTheme();

  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  useEffect(() => {
    setDocuments(documentIndex[category as keyof typeof documentIndex] || []);
  }, [category]);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearchActive, setSearchActive] = useState<boolean>(false);
  const handleSearchChange = (_: any, newValue?: string) => {
    setSearchTerm(newValue || '');
  };

  const [showFavoritesOnly] = useState<boolean>(false);
  const [favoriteDocs, setFavoriteDocs] = useState<number[]>([]);
  const toggleFavorite = (docId: number) => {
    setFavoriteDocs((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  // Filter logic for docs
  const filteredDocs = useMemo(() => {
    let final = documents;
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      final = final.filter(
        (d) =>
          d.title.toLowerCase().includes(lower) ||
          d.preview.toLowerCase().includes(lower)
      );
    }
    if (showFavoritesOnly) {
      final = final.filter((d) => favoriteDocs.includes(d.id));
    }
    return final;
  }, [documents, searchTerm, showFavoritesOnly, favoriteDocs]);

  // Recently used docs
  const [recentlyUsedDocs, setRecentlyUsedDocs] = useState<DocumentEntry[]>([]);
  const addToRecentlyUsed = (doc: DocumentEntry) => {
    setRecentlyUsedDocs((prev) => {
      if (prev.find((p) => p.id === doc.id)) return prev;
      return [doc, ...prev].slice(0, 3);
    });
  };

  // State for the selected document
  const [selectedDoc, setSelectedDoc] = useState<DocumentEntry | null>(null);
  const onSelectDocument = (doc: DocumentEntry) => {
    addToRecentlyUsed(doc);
    setSelectedDoc(doc);
  };
  const onCloseDocument = () => {
    setSelectedDoc(null);
  };

  // New state for hovered document (for pop-up preview) and pop-up position
  const [hoveredDoc, setHoveredDoc] = useState<DocumentEntry | null>(null);
  const [popUpPosition, setPopUpPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Build matter link (similar to MatterOverview)
  const matterLink = matter
    ? `https://eu.app.clio.com/nc/#/matters/${matter.UniqueID || '-'}` 
    : '';

  // If a document is selected, render the full-page DocumentDetailsPage.
  if (selectedDoc) {
    return <DocumentDetailsPage doc={selectedDoc} onBack={onCloseDocument} />;
  }

  // Style for the pop-up preview container
  const popUpStyle: React.CSSProperties = {
    position: 'fixed',
    left: popUpPosition.x + 10,
    top: popUpPosition.y + 10,
    backgroundColor: isDarkMode ? '#333' : '#fff',
    color: isDarkMode ? '#fff' : '#333',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    padding: '16px',
    borderRadius: 0,
    zIndex: 1000,
    maxWidth: '300px',
  };

  return (
    <div className={containerStyle}>
      {/* Header: Display matter reference with revealable search bar */}
      {matter && (
        <div className={headerContainerStyle}>
          <Stack horizontal verticalAlign="center" horizontalAlign="space-between" styles={{ root: { width: '100%' } }}>
            {/* Left Side: Display Number */}
            <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 8 }}>
              <Icon iconName="OpenFolderHorizontal" styles={{ root: { fontSize: 20, color: colours.highlight } }} />
              <Link
                href={matterLink}
                target="_blank"
                styles={{
                  root: {
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: colours.highlight,
                    textDecoration: 'none',
                  },
                }}
              >
                {matter.DisplayNumber || '-'}
              </Link>
            </Stack>
            {/* Right Side: Revealable Search Bar */}
            <div className={searchContainerStyle}>
              <div className={searchIconStyle} onClick={() => setSearchActive(!isSearchActive)} title="Toggle Search">
                <Icon iconName={isSearchActive ? 'Cancel' : 'Search'} styles={{ root: { fontSize: '20px', color: colours.highlight } }} />
              </div>
              <div className={searchBoxStyles(isSearchActive)}>
                <SearchBox
                  placeholder="Search Documents..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  underlined
                  styles={{ root: { fontFamily: 'Raleway, sans-serif' } }}
                />
              </div>
            </div>
          </Stack>
        </div>
      )}

      <Stack tokens={{ childrenGap: 20 }}>
        {/* Recently Used Docs */}
        {recentlyUsedDocs.length > 0 && (
          <Stack tokens={{ childrenGap: 10 }}>
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
              Recently Used
            </Text>
            <Stack horizontal tokens={{ childrenGap: 20 }}>
              {recentlyUsedDocs.map((doc) => (
                <Stack
                  key={doc.id}
                  horizontal
                  verticalAlign="center"
                  styles={{
                    root: {
                      backgroundColor: isDarkMode ? '#2b2b2b' : '#f5f5f5',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                    },
                  }}
                  onClick={() => onSelectDocument(doc)}
                >
                  <Icon iconName={doc.icon} styles={{ root: { fontSize: 16, marginRight: 6, color: colours.highlight } }} />
                  <Text variant="small" styles={{ root: { fontWeight: 600 } }}>
                    {doc.title}
                  </Text>
                </Stack>
              ))}
            </Stack>
          </Stack>
        )}

        {/* Document Cards Grid */}
        <div className={gridStyle}>
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              onMouseEnter={() => setHoveredDoc(doc)}
              onMouseMove={(e) => setPopUpPosition({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHoveredDoc(null)}
            >
              <DocumentCard
                doc={doc}
                isFavorited={favoriteDocs.includes(doc.id)}
                onSelect={onSelectDocument}
                toggleFavorite={toggleFavorite}
              />
            </div>
          ))}
        </div>
      </Stack>

      {/* Pop-up preview for document on hover */}
      {hoveredDoc && (
        <div style={popUpStyle}>
          {/* Header */}
          <Stack horizontal verticalAlign="center" tokens={{ childrenGap: 10 }}>
            <Icon iconName="WordLogo" styles={{ root: { fontSize: 40, color: colours.highlight } }} />
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>{hoveredDoc.title}</Text>
          </Stack>
          {/* Document Preview Window */}
          <div className={dummyContentStyle}>
            <div className={dummyFieldStyle} style={{ width: '90%' }} />
            <div className={dummyFieldStyle} style={{ width: '70%' }} />
            <div className={dummyFieldStyle} style={{ width: '80%' }} />
          </div>
          {/* Footer */}
          <Stack horizontal horizontalAlign="space-between" verticalAlign="center" styles={{ root: { marginTop: '12px' } }}>
            <Text variant="small">.docx</Text>
            <Text variant="small">Est. 1.2 MB</Text>
          </Stack>
        </div>
      )}
    </div>
  );
};

export default Documents;
