export type FeedStatus = 'success' | 'error' | 'active' | 'info';

export interface ActivityFeedItem {
  id: string;
  source: 'teams.bot' | 'teams.card' | 'activity.cardlab' | 'teams.bot.action' | 'activity.dm.send';
  sourceLabel: string;
  status: FeedStatus;
  title: string;
  summary?: string;
  timestamp: string;
  teamsLink?: string | null;
}

export interface CardLabTemplateMeta {
  id: string;
  label: string;
  category: string;
  description: string;
  defaultRoute: string;
  summary: string;
}

export interface CardLabRouteOption {
  key: string;
  label: string;
  teamId: string;
  channelId: string;
}

export interface CardLabRecentItem {
  id: string;
  templateId: string | null;
  templateLabel: string;
  routeKey: string;
  routeLabel: string;
  title: string;
  summary: string;
  teamsLink: string | null;
  messageId: string | null;
  timestamp: string;
}

export interface CardLabCatalogResponse {
  templates: CardLabTemplateMeta[];
  routes: CardLabRouteOption[];
  recent: CardLabRecentItem[];
}

export interface CardLabTemplateResponse {
  template: CardLabTemplateMeta | null;
  rawJson: string;
}

export interface CardLabRenderResponse {
  card: Record<string, unknown>;
  rawJson: string;
  warnings: string[];
  template: CardLabTemplateMeta | null;
}

export interface CardLabSendResponse {
  success: boolean;
  messageId: string | null;
  teamsLink: string | null;
  warnings: string[];
  item: CardLabRecentItem;
}