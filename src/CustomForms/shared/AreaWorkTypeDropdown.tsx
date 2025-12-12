// src/CustomForms/shared/AreaWorkTypeDropdown.tsx
// Shared cascading dropdown for Area of Work → Worktype selection

import React, { useMemo } from 'react';
import { Dropdown, IDropdownOption, Stack } from '@fluentui/react';
import { practiceAreasByArea } from '../../tabs/instructions/MatterOpening/config';

interface AreaWorkTypeDropdownProps {
  areaOfWork: string;
  worktype: string;
  onAreaChange: (area: string) => void;
  onWorktypeChange: (worktype: string) => void;
  dropdownStyles?: any;
  required?: boolean;
  disabled?: boolean;
}

export const AreaWorkTypeDropdown: React.FC<AreaWorkTypeDropdownProps> = ({
  areaOfWork,
  worktype,
  onAreaChange,
  onWorktypeChange,
  dropdownStyles,
  required = false,
  disabled = false,
}) => {
  // Area of Work options from config
  const areaOptions: IDropdownOption[] = useMemo(() => {
    return Object.keys(practiceAreasByArea).map((area) => ({
      key: area,
      text: area,
    }));
  }, []);

  // Worktype options based on selected area
  const worktypeOptions: IDropdownOption[] = useMemo(() => {
    if (!areaOfWork || !practiceAreasByArea[areaOfWork]) {
      return [];
    }
    return practiceAreasByArea[areaOfWork].map((type) => ({
      key: type,
      text: type,
    }));
  }, [areaOfWork]);

  const handleAreaChange = (_: any, option?: IDropdownOption) => {
    if (option) {
      onAreaChange(option.key as string);
      // Clear worktype when area changes
      onWorktypeChange('');
    }
  };

  const handleWorktypeChange = (_: any, option?: IDropdownOption) => {
    if (option) {
      onWorktypeChange(option.key as string);
    }
  };

  return (
    <Stack tokens={{ childrenGap: 16 }}>
      <Dropdown
        label="Area of Work"
        placeholder="Select area of work"
        options={areaOptions}
        selectedKey={areaOfWork || undefined}
        onChange={handleAreaChange}
        required={required}
        disabled={disabled}
        styles={dropdownStyles}
      />
      <Dropdown
        label="Work Type"
        placeholder={areaOfWork ? 'Select work type' : 'Select area of work first'}
        options={worktypeOptions}
        selectedKey={worktype || undefined}
        onChange={handleWorktypeChange}
        required={required}
        disabled={disabled || !areaOfWork}
        styles={dropdownStyles}
      />
    </Stack>
  );
};

export default AreaWorkTypeDropdown;
