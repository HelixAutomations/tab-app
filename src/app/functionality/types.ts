// src/app/functionality/types.ts

export type SectionName = 'Favorites' | 'General_Processes' | 'Operations';

export interface FormItem {
  title: string;
  url: string;
  icon: string;
  tags?: string[];
  description?: string;
  embedScript?: { 
    key: string; 
    formId: string; 
  }; // Add embedScript property
}
