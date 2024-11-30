import React from 'react';

const Workspace: React.FC = () => {
  return (
    <div
      style={{
        padding: '20px',
        height: '100%',
        overflow: 'auto',
        backgroundColor: '#f4f4f4',
        fontFamily: "'Raleway', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: '30px',
          padding: '15px',
          borderBottom: '2px solid #ccc',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
        }}
      >
        <h1
          style={{
            fontSize: '24px',
            margin: '0',
            color: '#333',
          }}
        >
          Workspace
        </h1>
      </div>

      {/* Section 1 */}
      <div
        style={{
          padding: '20px',
          backgroundColor: '#ffffff',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        }}
      ></div>

      {/* Divider */}
      <hr
        style={{
          border: '0',
          height: '1px',
          background: '#ddd',
          margin: '20px 0',
        }}
      />

      {/* Section 2 */}
      <div
        style={{
          padding: '20px',
          backgroundColor: '#ffffff',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        }}
      ></div>

      {/* Divider */}
      <hr
        style={{
          border: '0',
          height: '1px',
          background: '#ddd',
          margin: '20px 0',
        }}
      />

      {/* Section 3 */}
      <div
        style={{
          padding: '20px',
          backgroundColor: '#ffffff',
          border: '1px solid #ddd',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)',
        }}
      ></div>
    </div>
  );
};

export default Workspace;
