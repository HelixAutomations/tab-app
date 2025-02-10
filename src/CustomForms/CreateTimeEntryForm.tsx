// src/CustomForms/CreateTimeEntryForm.tsx

import React, { useState } from 'react';
import { Text, MessageBar, MessageBarType } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';
import BespokeForm, { BespokeFormProps } from './BespokeForms'; // Ensure correct import

const CreateTimeEntryForm: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (values: { [key: string]: string | number | boolean | File }) => {
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    const hours = parseInt(values['Hours'] as string, 10) || 0;
    const minutes = parseInt(values['Minutes'] as string, 10) || 0;
    const matterReference = (values['Matter Reference'] as string).trim();
    const date = values['Date'] as string;
    const description = (values['Description'] as string).trim();

    if (!hours && !minutes) {
      setError('Please enter the duration.');
      setIsSubmitting(false);
      return;
    }

    if (isNaN(hours) || hours < 0 || isNaN(minutes) || minutes < 0 || minutes >= 60) {
      setError('Please enter valid hours and minutes.');
      setIsSubmitting(false);
      return;
    }

    if (!matterReference) {
      setError('Matter Reference is required.');
      setIsSubmitting(false);
      return;
    }

    if (!date) {
      setError('Date is required.');
      setIsSubmitting(false);
      return;
    }

    if (!description) {
      setError('Description is required.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('https://your-api-endpoint.com/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours,
          minutes,
          matterReference,
          date,
          description,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create time entry. Please try again.');
      }

      setSuccess('Time entry created successfully!');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Handle form cancellation
  };

  const fields: BespokeFormProps['fields'] = [
    {
      label: 'Hours',
      name: 'Hours',
      type: 'number',
      required: true,
      placeholder: 'Enter hours',
      step: 1,
      min: 0,
    },
    {
      label: 'Minutes',
      name: 'Minutes',
      type: 'number',
      required: true,
      placeholder: 'Enter minutes',
      step: 1,
      min: 0,
      max: 59,
    },
    {
      label: 'Matter Reference',
      name: 'Matter Reference',
      type: 'text',
      required: true,
      placeholder: 'Enter Matter Reference',
    },
    {
      label: 'Date',
      name: 'Date',
      type: 'text',
      required: true,
    },
    {
      label: 'Description',
      name: 'Description',
      type: 'textarea',
      required: true,
      placeholder: 'Enter Description',
    },
  ];
  
  return (
    <div>
      <Text
        variant="large"
        style={{
          marginBottom: '20px',
          color: isDarkMode ? colours.dark.text : colours.light.text,
        }}
      >
        Create Time Entry
      </Text>
      <BespokeForm
        fields={fields}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isSubmitting}
        matters={[]}
      />
      {error && (
        <MessageBar
          messageBarType={MessageBarType.error}
          isMultiline={false}
          styles={{
            root: {
              marginTop: '10px',
              backgroundColor: colours.cta,
              color: '#ffffff',
            },
          }}
        >
          {error}
        </MessageBar>
      )}
      {success && (
        <MessageBar
          messageBarType={MessageBarType.success}
          isMultiline={false}
          styles={{
            root: {
              marginTop: '10px',
              backgroundColor: colours.green,
              color: '#ffffff',
            },
          }}
        >
          {success}
        </MessageBar>
      )}
    </div>
  );
};

export default CreateTimeEntryForm;
