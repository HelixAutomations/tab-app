import React from 'react';
import {
  FaFolder,
  FaFolderOpen,
  FaIdBadge,
  FaUserCheck,
  FaMobileAlt,
  FaShieldAlt,
  FaPaperPlane,
  FaCheck,
  FaUmbrellaBeach,
  FaEdit,
  FaFileInvoiceDollar,
  FaClock,
  FaFileAlt,
} from 'react-icons/fa';
import {
  MdArticle,
  MdEventSeat,
  MdSlideshow,
  MdFactCheck,
  MdLocationOn,
} from 'react-icons/md';
import { Icon } from '@fluentui/react/lib/Icon';

type IconComponent = React.ComponentType<{ style?: React.CSSProperties; className?: string }>;

const CalendarDayIcon: IconComponent = (props) => (
  <Icon iconName="CalendarDay" style={props?.style} className={props?.className} />
);

const chipIconMap: Record<string, IconComponent> = {
  OpenFile: FaFolderOpen,
  Folder: FaFolder,
  Phone: FaMobileAlt,
  Calendar: CalendarDayIcon,
  CalendarCheck: CalendarDayIcon,
  Accept: FaCheck,
  ContactCard: FaIdBadge,
  Verify: FaUserCheck,
  IdCheck: FaIdBadge,
  Shield: FaShieldAlt,
  Send: FaPaperPlane,
  ReviewRequestMirrored: MdFactCheck,
  Presentation: MdSlideshow,
  PalmTree: FaUmbrellaBeach,
  Edit: FaEdit,
  Money: FaFileInvoiceDollar,
  KnowledgeArticle: MdArticle,
  Room: MdEventSeat,
  Attendance: MdLocationOn,
  Timer: FaClock,
  CCL: FaFileAlt,
  DocumentSet: FaFileAlt,
};

export function getChipIcon(name: string): React.ComponentType<any> {
  return chipIconMap[name] || FaFolder;
}
