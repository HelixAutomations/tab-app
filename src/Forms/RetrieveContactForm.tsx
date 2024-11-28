// src/Forms/RetrieveContactForm.tsx

import React, { useState } from 'react';
import { Stack, TextField, PrimaryButton, Label, MessageBar, MessageBarType } from '@fluentui/react';

const RetrieveContactForm: React.FC = () => {
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Basic validation
    if (!email) {
      setError('Email is required.');
      return;
    }

    // Simulate form submission
    setTimeout(() => {
      setSuccess('Contact retrieved successfully!');
      setEmail('');
    }, 1000);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack tokens={{ childrenGap: 15 }}>
        <Label>Retrieve Contact</Label>
        <TextField
          label="Email Address"
          value={email}
          onChange={(e, newValue) => setEmail(newValue || '')}
          required
          type="email"
        />
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        {success && <MessageBar messageBarType={MessageBarType.success}>{success}</MessageBar>}
        <PrimaryButton type="submit">Retrieve</PrimaryButton>
      </Stack>
    </form>
  );
};

export default RetrieveContactForm;
