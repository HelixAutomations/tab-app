import React from 'react';
import Range from 'rc-slider';
import 'rc-slider/assets/index.css';
import { format } from 'date-fns';
import { useTheme } from '../../app/functionality/ThemeContext';
import { colours } from '../../app/styles/colours';

interface ModernDateRangeSliderProps {
  validDates: Date[];
  currentSliderStart: number;
  currentSliderEnd: number;
  onChange: (values: [number, number]) => void;
}

const ModernDateRangeSlider: React.FC<ModernDateRangeSliderProps> = ({
  validDates,
  currentSliderStart,
  currentSliderEnd,
  onChange,
}) => {
  const { isDarkMode } = useTheme();

  // Define marks for the first and last date (optional: you can add more marks if desired)
  const marks = {
    0: format(validDates[0], 'dd MMM yyyy'),
    [validDates.length - 1]: format(validDates[validDates.length - 1], 'dd MMM yyyy'),
  };

  return (
    <div
      style={{
        width: 600,
        margin: '0 auto',
        padding: '20px 0',
      }}
    >
      <Range
        min={0}
        max={validDates.length - 1}
        value={[currentSliderStart, currentSliderEnd]}
        onChange={(value: number | number[]) => {
          if (Array.isArray(value)) onChange([value[0], value[1]]);
        }}
        marks={marks}
        step={1}
        trackStyle={[{ backgroundColor: colours.highlight, height: 6 }]}
        handleStyle={[
          {
            backgroundColor: '#fff',
            border: `2px solid ${colours.highlight}`,
            height: 24,
            width: 24,
            marginTop: -9,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          },
          {
            backgroundColor: '#fff',
            border: `2px solid ${colours.highlight}`,
            height: 24,
            width: 24,
            marginTop: -9,
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          },
        ]}
        railStyle={{ backgroundColor: isDarkMode ? '#555' : '#ccc', height: 6 }}
      />
    </div>
  );
};

export default ModernDateRangeSlider;
