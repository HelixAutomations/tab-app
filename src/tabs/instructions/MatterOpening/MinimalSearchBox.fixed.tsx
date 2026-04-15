//
import React, { useState } from 'react';
// invisible change 2.2
import { SearchBox } from '@fluentui/react/lib/SearchBox';
import { colours } from '../../../app/styles/colours';
import './MinimalSearchBox.css';

interface MinimalSearchBoxProps {
  value: string;
  onChange: (v: string) => void;
}
const MinimalSearchBox: React.FC<MinimalSearchBoxProps> = ({ value, onChange }) => {
  const [focused, setFocused] = useState(false);

  return (
    <div className={`minimal-searchbox${focused ? ' expanded' : ''}`}>
      {!focused && !value && (
        <button
          className="minimal-searchbox-iconbtn"
          aria-label="Search clients"
          tabIndex={0}
          type="button"
          onClick={() => setFocused(true)}
        >
          <span className="ms-SearchBox-icon" style={{ color: colours.highlight, fontSize: 20, display: 'flex', alignItems: 'center' }}>
            <i className="ms-Icon ms-Icon--Search" aria-hidden="true" />
          </span>
        </button>
      )}
      {(focused || value) && (
        <SearchBox
          value={value}
          onChange={(_, v) => onChange(v || '')}
          placeholder="Search clients..."
          styles={{
            root: {
              background: '#fff',
              borderRadius: 24,
              minWidth: 220,
              maxWidth: 320,
              boxShadow: '0 4px 24px 0 rgba(0,120,212,0.12)',
              transition: 'box-shadow 0.3s',
              border: '1.5px solid #0078d4',
              padding: '0 8px',
            },
            field: {
              fontSize: 16,
              background: 'transparent',
              border: 'none',
              padding: '8px 0',
            },
            icon: {
              color: colours.highlight,
              fontSize: 18,
            },
          }}
          underlined={false}
          disableAnimation={false}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
        />
      )}
    </div>
  );
};

export default MinimalSearchBox;
