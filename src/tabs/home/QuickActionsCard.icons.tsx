import React from 'react';
import {
  FaRegCheckSquare,
  FaCheckSquare,
  FaRegBuilding,
  FaBuilding,
  FaRegUser,
  FaUser,
  FaRegFolder,
  FaFolder,
  FaRegIdBadge,
  FaIdBadge,
  FaMobileAlt,
  FaUmbrellaBeach,
} from 'react-icons/fa';
import {
  AiOutlinePlus,
  AiFillPlusSquare,
} from 'react-icons/ai';
import {
  MdOutlineEventSeat,
  MdEventSeat,
  MdOutlineAssessment,
  MdAssessment,
  MdOutlineArticle,
  MdArticle,
  MdOutlineLocationCity,
  MdLocationCity,
  MdOutlineConstruction,
  MdConstruction,
  MdSmartphone,
  MdOutlineSlideshow,
  MdSlideshow,
  MdOutlineLocationOn,
  MdLocationOn,
} from 'react-icons/md';
import { Icon } from '@fluentui/react/lib/Icon';

type IconComponent = React.ComponentType<{ style?: React.CSSProperties; className?: string }>;

const CalendarDayIcon = React.forwardRef<HTMLElement, { style?: React.CSSProperties; className?: string }>((props, ref) => {
  return <Icon iconName="CalendarDay" style={props.style} className={props.className} />;
});
CalendarDayIcon.displayName = 'CalendarDayIcon';

const iconMap: Record<string, { outline: IconComponent; filled: IconComponent }> = {
  Accept: { outline: FaRegCheckSquare, filled: FaCheckSquare },
  Checklist: { outline: FaRegCheckSquare, filled: FaCheckSquare },
  Comment: { outline: MdSmartphone, filled: FaMobileAlt },
  Calendar: { outline: CalendarDayIcon, filled: CalendarDayIcon },
  CalendarCheck: { outline: FaRegUser, filled: FaUser },
  Room: { outline: MdOutlineEventSeat, filled: MdEventSeat },
  Building: { outline: FaRegBuilding, filled: FaBuilding },
  Plus: { outline: AiOutlinePlus, filled: AiFillPlusSquare },
  Phone: { outline: MdSmartphone, filled: FaMobileAlt },
  Leave: { outline: FaUmbrellaBeach, filled: FaUmbrellaBeach },
  PalmTree: { outline: FaUmbrellaBeach, filled: FaUmbrellaBeach },
  OpenFile: { outline: FaRegFolder, filled: FaFolder },
  IdCheck: { outline: FaRegIdBadge, filled: FaIdBadge },
  Assessment: { outline: MdOutlineAssessment, filled: MdAssessment },
  KnowledgeArticle: { outline: MdOutlineArticle, filled: MdArticle },
  CityNext: { outline: MdOutlineLocationCity, filled: MdLocationCity },
  ConstructionCone: { outline: MdOutlineConstruction, filled: MdConstruction },
  Presentation: { outline: MdOutlineSlideshow, filled: MdSlideshow },
  Attendance: { outline: MdOutlineLocationOn, filled: MdLocationOn },
};

export function getQuickActionIcons(iconName: string): {
  OutlineIcon: React.ComponentType<any>;
  FilledIcon: React.ComponentType<any>;
} {
  const mapping = iconMap[iconName];
  if (!mapping) {
    return {
      OutlineIcon: FaRegCheckSquare,
      FilledIcon: FaCheckSquare,
    };
  }

  return {
    OutlineIcon: mapping.outline,
    FilledIcon: mapping.filled,
  };
}

export function getQuickActionIcon(iconName: string): React.ComponentType<any> | null {
  const mapping = iconMap[iconName];
  if (!mapping) {
    console.warn(`No icon mapping found for: ${iconName}`);
    return null;
  }
  return mapping.filled;
}
