// src/Forms/Tasking.tsx

import React from 'react';

const Tasking: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <iframe
        src="https://www.cognitoforms.com/f/QzaAr_2Q7kesClKq8g229g/90"
        allow="payment"
        style={{ border: 0, width: '100%', height: '600px' }} // Adjust height as needed
        title="Create a Task"
      ></iframe>
    </div>
  );
};

export default Tasking;
