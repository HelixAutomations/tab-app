// src/tabs/Reporting/ReportingCode.tsx

import React, { useState } from 'react';
import ReportingHome from './ReportingHome';
import './ReportingCode.css';

const acceptablePasscodes = ['JW', 'AC', 'LZ'];

const ReportingCode: React.FC = () => {
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (acceptablePasscodes.includes(passcode.trim().toUpperCase())) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Invalid passcode. Please try again.');
    }
  };

  if (isAuthenticated) {
    return <ReportingHome />;
  }

  return (
    <div className="reporting-code-container">
      <div className="passcode-card">
        <h2>Access Reporting Dashboard</h2>
        <form onSubmit={handleSubmit} className="passcode-form">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter Passcode"
            required
            className="passcode-input"
          />
          <button type="submit" className="submit-button">
            Submit
          </button>
        </form>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
};

export default ReportingCode;
