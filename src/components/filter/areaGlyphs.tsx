import React from 'react';
import { colours } from '../../app/styles/colours';
import { FaBriefcase, FaBuilding, FaFolderOpen, FaHardHat, FaHome, FaInfoCircle, FaUserMd } from 'react-icons/fa';

export type AreaGlyphVariant = 'emoji' | 'glyph';

export interface AreaGlyphMeta {
  key: string;
  color: string;
}

export const getAreaGlyphMeta = (areaOfWork: string): AreaGlyphMeta => {
  const area = (areaOfWork || '').toLowerCase().trim();

  if (!area || area === 'general') {
    return { key: 'Other/Unsure', color: colours.greyText };
  }
  if (area.includes('triage')) {
    return { key: 'Triage', color: colours.greyText };
  }
  if (area.includes('construction') || area.includes('building')) {
    return { key: 'Construction', color: colours.orange };
  }
  if (area.includes('property') || area.includes('real estate') || area.includes('conveyancing')) {
    return { key: 'Property', color: colours.green };
  }
  if (area.includes('commercial') || area.includes('business')) {
    return { key: 'Commercial', color: colours.blue };
  }
  if (area.includes('employment') || area.includes('hr') || area.includes('workplace')) {
    return { key: 'Employment', color: colours.yellow };
  }
  if (area.includes('allocation')) {
    return { key: 'Allocation', color: colours.greyText };
  }

  return { key: 'Other/Unsure', color: colours.greyText };
};

export const renderAreaGlyph = (
  areaKey: string,
  color: string,
  variant: AreaGlyphVariant = 'glyph',
  size = 16
): React.ReactElement => {
  if (variant === 'emoji') {
    const emojiByArea: Record<string, string> = {
      Commercial: '🏢',
      Property: '🏠',
      Construction: '🏗️',
      Employment: '👩🏻‍💼',
      Triage: '🩺',
      Allocation: '📂',
      'Other/Unsure': 'ℹ️',
    };

    return <span style={{ fontSize: size, lineHeight: 1 }}>{emojiByArea[areaKey] || '•'}</span>;
  }

  switch (areaKey) {
    case 'Commercial':
      return <FaBuilding size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
    case 'Property':
      return <FaHome size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
    case 'Construction':
      return <FaHardHat size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
    case 'Employment':
      return <FaBriefcase size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
    case 'Triage':
      return <FaUserMd size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
    case 'Allocation':
      return <FaFolderOpen size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
    default:
      return <FaInfoCircle size={size} style={{ color, display: 'inline-block' }} aria-hidden />;
  }
};

export const renderAreaOfWorkGlyph = (
  areaOfWork: string,
  color?: string,
  variant: AreaGlyphVariant = 'glyph',
  size = 16
): React.ReactElement => {
  const meta = getAreaGlyphMeta(areaOfWork);
  return renderAreaGlyph(meta.key, color ?? meta.color, variant, size);
};