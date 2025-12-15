# Enquiries.tsx Connected Files Map

## 📋 **MAIN ENQUIRY FILE**
- `src/tabs/enquiries/Enquiries.tsx` (4,535 lines) - Main enquiries management component

## 🔧 **UTILITY IMPORTS**
### Core Utilities
- `utils/getProxyBaseUrl.ts` - API proxy URL configuration
- `utils/debug.ts` - Debug logging utilities
- `utils/claimEnquiry.ts` - Enquiry claiming functionality

### Date/Time Utils
- `date-fns` - Date parsing and formatting (parseISO, startOfMonth, format, isValid)

## 🎨 **UI COMPONENT IMPORTS**
### Fluent UI Core
- `@fluentui/react` - All Fluent UI components (Stack, Text, Icon, etc.)
- `rc-slider` - Slider components with CSS assets
- `recharts` - Charts (BarChart, Bar, CartesianGrid, Tooltip, etc.)

### Custom Components
- `components/filter/SegmentedControl.tsx` - Custom segmented control
- `components/filter/IconAreaFilter.tsx` - Icon-based area filtering
- `components/filter/FilterBanner.tsx` - Filter status banner
- `components/PitchScenarioBadge.tsx` - Pitch scenario indicators
- `components/TeamsLinkWidget.tsx` - Teams integration widget

## 🏗️ **ENQUIRY-SPECIFIC COMPONENTS**
### Card Components
- `tabs/enquiries/EnquiryLineItem.tsx` - Individual enquiry line display
- `tabs/enquiries/NewUnclaimedEnquiryCard.tsx` - Unclaimed enquiry cards
- `tabs/enquiries/ClaimedEnquiryCard.tsx` - Claimed enquiry cards
- `tabs/enquiries/GroupedEnquiryCard.tsx` - Grouped enquiry display

### Feature Components
- `tabs/enquiries/UnclaimedEnquiries.tsx` - Unclaimed enquiries management
- `tabs/enquiries/PitchBuilder.tsx` - Pitch creation interface
- `tabs/enquiries/EnquiryTimeline.tsx` - Enquiry timeline visualization
- `tabs/enquiries/CreateContactModal.tsx` - Contact creation modal
- `tabs/enquiries/AreaCountCard.tsx` - Area statistics cards

### Logic & Grouping
- `tabs/enquiries/enquiryGrouping.ts` - Enquiry grouping logic
- `tabs/enquiries/pitch-builder/scenarios.ts` - Pitch scenarios data
- `tabs/enquiries/pitch-builder/OperationStatusToast.tsx` - Operation feedback

## 📊 **DATA & TYPES**
### Type Definitions
- `app/functionality/types.ts` - Core types (Enquiry, POID, UserData, TeamData)
- `app/functionality/newEnquiryTypes.ts` - New enquiry system types

### Data Fetching
- `app/functionality/enquiryEnrichment.ts` - Enquiry data enrichment
- `app/functionality/fetchNewEnquiries.ts` - New enquiry system API

## 🎨 **STYLING & THEMES**
### Style Systems
- `app/styles/colours.ts` - Color palette definitions
- `app/styles/FilterStyles.ts` - Shared filter styling
- `app/styles/NavigatorPivot.css` - Navigator-specific styles

### Theme Context
- `app/functionality/ThemeContext.tsx` - Dark/light mode management

## 🏢 **CONTEXT & STATE**
### App Context
- `app/functionality/NavigatorContext.tsx` - Navigation state management
- `app/functionality/TeamsContext.tsx` - Teams app context

### Teams Integration
- `@microsoft/teams-js` - Teams SDK integration
- `app/admin.ts` - Admin user permissions

## 🔄 **EXTERNAL SERVICES**
### Platform Integration
- Connected to enquiry-processing-v2 submodule (via API calls)
- ActiveCampaign integration (AC records)
- Teams bot integration
- Database connections (legacy and new systems)

## 📈 **ANALYSIS COMPONENTS**
- `components/EnquiryDataInspector.tsx` - Development debugging tool
- `components/modern/EnquiryMetricsV2.tsx` - Modern metrics display

## 🗄️ **ADDITIONAL ENQUIRY FEATURES**
- `tabs/enquiries/EnquiryDetails.tsx` - Detailed enquiry view
- `tabs/enquiries/EnquiryData.tsx` - Enquiry data display
- `tabs/enquiries/EnquiryEmails.tsx` - Email history
- `tabs/enquiries/EnquiryCalls.tsx` - Call history
- `tabs/enquiries/NewEnquiryTest.tsx` - Testing interface
- `tabs/enquiries/NewEnquiryList.tsx` - New system list view

## 🔗 **TOTAL FILE COUNT: ~45+ Connected Files**

### Key Integration Points:
1. **Legacy System**: Direct database connections to helix-core-data
2. **New System**: enquiry-processing-v2 platform service
3. **Teams Integration**: Real-time Teams app functionality
4. **ActiveCampaign**: CRM synchronization
5. **UI Framework**: Fluent UI + custom components
6. **State Management**: React contexts + local state
7. **Development Tools**: Inspector, debugging, testing interfaces

This represents a comprehensive enquiries management ecosystem with deep integration across multiple systems and services.