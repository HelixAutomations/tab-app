// src/types.ts

export type SectionName = 'Favorites' | 'General_Processes' | 'Operations';

export interface LinkItem {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
}
