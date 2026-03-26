// invisible change 3
// src/components/CustomDivider.tsx
import React from 'react';
import { mergeStyles } from '@fluentui/react/lib/Styling';
const dividerStyle = mergeStyles({
  borderTop: '1px solid #eaeaea',
  margin: '20px 0',
});

const CustomDivider: React.FC = () => {
  return <div className={dividerStyle} />;
};

export default CustomDivider;
