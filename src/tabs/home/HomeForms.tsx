// src/tabs/home/HomeForms.ts

export const officeAttendanceForm = {
    title: "Confirm Office Attendance",
    link: "https://www.cognitoforms.com/Helix1/OfficeAttendance",
    fields: [
      {
        label: 'Date',
        type: 'date',
        required: true,
        placeholder: 'Select the date',
      },
      {
        label: 'Reason for Attendance',
        type: 'textarea',
        required: true,
        placeholder: 'Enter the reason for your attendance',
      },
    ],
  };
  
  export const annualLeaveForm = {
    title: "Request Annual Leave",
    link: "https://eu.app.clio.com/nc#/calendars",
    fields: [
      {
        label: 'Start Date',
        type: 'date',
        required: true,
        group: 'dateRange', // Grouping Start Date
        placeholder: 'Select start date',
      },
      {
        label: 'End Date',
        type: 'date',
        required: true,
        group: 'dateRange', // Grouping End Date
        placeholder: 'Select end date',
      },
      {
        label: 'Reason for Leave',
        type: 'textarea',
        required: true,
        placeholder: 'Enter the reason for your leave',
      },
    ],
  };
  