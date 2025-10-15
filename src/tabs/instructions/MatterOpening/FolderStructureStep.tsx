//
import React from 'react'; // invisible change // invisible change
// invisible change 2.2
import { Stack, Text } from '@fluentui/react';
import '../../../app/styles/MultiSelect.css';
import ModernMultiSelect from './ModernMultiSelect';
import { useTheme } from '../../../app/functionality/ThemeContext';
import { colours } from '../../../app/styles/colours';

interface FolderStructureStepProps {
    folderStructure: string;
    setFolderStructure: (v: string) => void;
    onContinue: () => void;
    folderOptions: string[];
}

const FolderStructureStep: React.FC<FolderStructureStepProps> = ({ folderStructure, setFolderStructure, onContinue, folderOptions }) => {
    const { isDarkMode } = useTheme();
    
    // Professional theme colors
    const themeColours = {
        bg: isDarkMode 
            ? 'linear-gradient(135deg, #0B1220 0%, #1F2937 100%)'
            : 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
        border: isDarkMode ? '#334155' : '#E2E8F0',
        text: isDarkMode ? '#E5E7EB' : '#0F172A',
        shadow: isDarkMode 
            ? '0 2px 4px rgba(0, 0, 0, 0.3)'
            : '0 2px 4px rgba(0, 0, 0, 0.04)',
        iconColor: colours.highlight // Use standard highlight color
    };

    return (
        <div style={{
            background: themeColours.bg,
            border: `1px solid ${themeColours.border}`,
            borderRadius: 12,
            padding: 20,
            boxShadow: themeColours.shadow,
            boxSizing: 'border-box'
        }}>
            <Stack tokens={{ childrenGap: 16 }}>
                {/* Professional header with icon */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8, 
                    marginBottom: 4 
                }}>
                    <i className="ms-Icon ms-Icon--FolderHorizontal" style={{ 
                        fontSize: 16, 
                        color: themeColours.iconColor 
                    }} />
                    <span style={{ 
                        fontSize: 16, 
                        fontWeight: 600, 
                        color: themeColours.text 
                    }}>
                        Select NetDocuments Folder Structure
                    </span>
                </div>
                
                <ModernMultiSelect
                    label=""
                    options={folderOptions.map(option => ({ key: option, text: option }))}
                    selectedValue={folderStructure}
                    onSelectionChange={(value) => {
                        setFolderStructure(value);
                        onContinue();
                    }}
                    variant="default"
                />
            </Stack>
        </div>
    );
};

export default FolderStructureStep;