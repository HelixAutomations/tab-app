import React from 'react';
import DataTable, { TableColumn, TableConfig } from './DataTable';

// Example usage of the DataTable component following enquiries table pattern

interface ExampleRecord {
  id: number;
  date: string;
  name: string;
  email: string;
  value: number;
  status: 'active' | 'pending' | 'completed';
  notes: string;
}

// Example configuration
const exampleConfig: TableConfig<ExampleRecord> = {
  columns: [
    {
      key: 'date',
      header: 'Date',
      width: '70px',
      sortable: true,
      render: (item) => {
        const date = new Date(item.date);
        return (
          <div style={{ fontSize: '11px', fontWeight: '500' }}>
            {date.toLocaleDateString('en-GB', { 
              day: 'numeric', 
              month: 'short' 
            })}
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      width: '40px',
      render: (item) => {
        const statusColors = {
          active: '#10b981',
          pending: '#f59e0b',
          completed: '#6b7280'
        };
        return (
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: statusColors[item.status],
              margin: '0 auto'
            }}
            title={item.status}
          />
        );
      }
    },
    {
      key: 'value',
      header: 'Value',
      width: '0.6fr',
      sortable: true,
      render: (item) => (
        <div style={{ fontWeight: '600' }}>
          £{item.value.toLocaleString()}
        </div>
      )
    },
    {
      key: 'name',
      header: 'Contact',
      width: '1.4fr',
      sortable: true,
      render: (item) => (
        <div>
          <div style={{ fontWeight: '500' }}>{item.name}</div>
          <div style={{ fontSize: '11px', opacity: 0.7 }}>{item.email}</div>
        </div>
      )
    },
    {
      key: 'notes',
      header: 'Notes',
      width: '2fr',
      render: (item) => (
        <div style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {item.notes}
        </div>
      )
    },
    {
      key: 'id',
      header: 'Actions',
      width: '0.5fr',
      render: (item) => (
        <div style={{ textAlign: 'right' }}>
          <button
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px'
            }}
            onClick={(e) => {
              e.stopPropagation();
              console.log('Edit', item.id);
            }}
          >
            ✏️
          </button>
        </div>
      )
    }
  ],
  defaultSort: {
    column: 'date',
    direction: 'desc'
  },
  showTimeline: true,
  groupByDate: true,
  dateField: 'date'
};

// Example component
const ExampleTableUsage: React.FC = () => {
  const sampleData: ExampleRecord[] = [
    {
      id: 1,
      date: '2026-01-01T10:30:00Z',
      name: 'John Smith',
      email: 'john.smith@example.com',
      value: 5000,
      status: 'active',
      notes: 'Initial consultation completed, awaiting documentation'
    },
    {
      id: 2,
      date: '2025-12-30T14:15:00Z',
      name: 'Sarah Wilson',
      email: 'sarah.wilson@example.com',
      value: 3500,
      status: 'pending',
      notes: 'Contract review in progress'
    },
    {
      id: 3,
      date: '2025-12-30T09:45:00Z',
      name: 'Michael Brown',
      email: 'michael.brown@example.com',
      value: 7500,
      status: 'completed',
      notes: 'Settlement reached, case closed'
    }
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h2>Example Table Implementation</h2>
      <DataTable
        data={sampleData}
        config={exampleConfig}
        onRowClick={(item: any) => console.log('Row clicked:', item)}
        emptyMessage="No records found"
      />
    </div>
  );
};

export default ExampleTableUsage;