// src/app/functionality/types.ts

export type SectionName = 'Favorites' | 'General_Processes' | 'Operations' | 'Financial';

export interface FormItem {
  title: string;
  url: string;
  icon: string;
  tags?: string[]; // Existing tags property
  description?: string;
  embedScript?: {
    key: string;
    formId: string;
  };
  fields?: Array<{
    label: string;
    type: 'text' | 'number' | 'textarea' | 'dropdown' | 'toggle' | 'currency-picker' | 'file'; // Added 'file'
    options?: string[]; // For dropdowns
    step?: number; // For number inputs
    editable?: boolean; // For currency-picker or number inputs
    required?: boolean;
    defaultValue?: boolean | string | number | File; // Included File type
    prefix?: string; // Add prefix for currency or similar
    helpText?: string; // Add help text for tooltips or field explanations
    placeholder?: string; // Optional: For additional placeholders
  }>; // Add fields for forms
}
