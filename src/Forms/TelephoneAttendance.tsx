// src/Forms/TelephoneAttendance.tsx

import React from 'react';

const TelephoneAttendance: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <iframe
        src="https://www.cognitoforms.com/f/QzaAr_2Q7kesClKq8g229g/41"
        allow="payment"
        style={{ border: 0, width: '100%', height: '600px' }} // Adjust height as needed
        title="Telephone Attendance"
      ></iframe>
    </div>
  );
};

export default TelephoneAttendance;
