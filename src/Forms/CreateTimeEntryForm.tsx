// src/Forms/CreateTimeEntryForm.tsx

import React, { useState } from 'react';
import { Stack, TextField, PrimaryButton, Dropdown, IDropdownOption, Label, MessageBar, MessageBarType } from '@fluentui/react';

const CreateTimeEntryForm: React.FC = () => {
  const [task, setTask] = useState<string>('');
  const [hours, setHours] = useState<string>(''); // Changed to string
  const [date, setDate] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const taskOptions: IDropdownOption[] = [
    { key: 'Development', text: 'Development' },
    { key: 'Design', text: 'Design' },
    { key: 'Testing', text: 'Testing' },
    { key: 'Deployment', text: 'Deployment' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Basic validation
    if (!task || !hours || !date) {
      setError('All fields are required.');
      return;
    }

    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours < 0) {
      setError('Hours must be a positive number.');
      return;
    }

    // Simulate form submission
    setTimeout(() => {
      setSuccess('Time entry created successfully!');
      setTask('');
      setHours('');
      setDate('');
    }, 1000);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack tokens={{ childrenGap: 15 }}>
        <Label>Create Time Entry</Label>
        <Dropdown
          label="Task"
          selectedKey={task}
          onChange={(e, option) => setTask(option?.key as string)}
          options={taskOptions}
          placeholder="Select a task"
          required
        />
        <TextField
          label="Hours"
          type="number"
          value={hours}
          onChange={(e, newValue) => setHours(newValue || '')} // Now handling string
          required
          min={0}
        />
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e, newValue) => setDate(newValue || '')}
          required
        />
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        {success && <MessageBar messageBarType={MessageBarType.success}>{success}</MessageBar>}
        <PrimaryButton type="submit">Create</PrimaryButton>
      </Stack>
    </form>
  );
};

export default CreateTimeEntryForm;
