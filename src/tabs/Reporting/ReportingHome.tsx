// src/tabs/Reporting/ReportingHome.tsx

import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';
import './ReportingHome.css';
import { colours } from '../../app/styles/colours';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  ArcElement
);

const ReportingHome: React.FC = () => {
  // Define CSS variables based on the colours object
  const cssVariables = {
    '--websiteBlue': colours.websiteBlue,
    '--darkBlue': colours.darkBlue,
    '--blue': colours.blue,
    '--highlight': colours.highlight,
    '--accent': colours.accent,
    '--cta': colours.cta,
    '--grey': colours.grey,
    '--greyText': colours.greyText,
    '--sectionBackground': colours.sectionBackground,
    '--inactiveTrackLight': colours.inactiveTrackLight,
    '--highlightYellow': colours.highlightYellow,
    '--highlightBlue': colours.highlightBlue,
  } as React.CSSProperties;

  // Dummy data for metrics
  const metrics = [
    { name: 'WIP', value: 120, color: 'var(--blue)' },
    { name: 'Collected Time', value: '350 hrs', color: 'var(--blue)' },
    { name: 'Bills Raised', value: 75, color: 'var(--blue)' },
    { name: 'Enquiries Taken', value: 200, color: 'var(--blue)' },
    { name: 'Matters Opened', value: 50, color: 'var(--blue)' },
    { name: 'Tasks Pending', value: 30, color: 'var(--cta)' },
    { name: 'Tasks Completed', value: 150, color: 'var(--blue)' },
  ];

  // Chart Data
  const wipData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'WIP',
        data: [20, 35, 30, 50, 45, 60],
        backgroundColor: 'var(--blue)',
      },
    ],
  };

  const collectedTimeData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: 'Collected Time (hrs)',
        data: [80, 120, 100, 50],
        backgroundColor: 'var(--blue)',
        borderColor: 'var(--darkBlue)',
        fill: false,
      },
    ],
  };

  const billsRaisedData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'Bills Raised',
        data: [10, 15, 7, 20, 23],
        backgroundColor: 'var(--blue)',
      },
    ],
  };

  const enquiriesData = {
    labels: ['Phone', 'Email', 'Web Form', 'Other'],
    datasets: [
      {
        label: 'Enquiries',
        data: [80, 50, 40, 30],
        backgroundColor: [
          'var(--cta)', // Red
          'var(--blue)', // Blue
          'var(--blue)', // Fallback to blue
          'var(--cta)', // Red
        ],
      },
    ],
  };

  const tasksData = {
    labels: ['Pending', 'Completed'],
    datasets: [
      {
        label: 'Tasks',
        data: [
          metrics.find((m) => m.name === 'Tasks Pending')?.value || 0,
          metrics.find((m) => m.name === 'Tasks Completed')?.value || 0,
        ],
        backgroundColor: ['var(--cta)', 'var(--blue)'],
      },
    ],
  };

  const mattersOpenedData = {
    labels: ['Adjudication Advice', 'Partnership Advice', 'L&T Commercial', 'L&T Residential'],
    datasets: [
      {
        label: 'Matters Opened',
        data: [20, 15, 10, 5],
        backgroundColor: [
          'var(--blue)',
          'var(--blue)', // Fallback to blue
          'var(--cta)', // Red
          'var(--cta)', // Red
        ],
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: 'var(--greyText)', // Using greyText for legends
        },
      },
      title: {
        display: false,
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'var(--greyText)', // Refined grey for x-axis labels
        },
        grid: {
          color: 'rgba(107, 107, 107, 0.2)', // Lighter grey for grid lines
        },
      },
      y: {
        ticks: {
          color: 'var(--greyText)', // Refined grey for y-axis labels
        },
        grid: {
          color: 'rgba(107, 107, 107, 0.2)', // Lighter grey for grid lines
        },
      },
    },
  };

  return (
    <div className="reporting-home-container" style={cssVariables}>
      <h1 className="reporting-title">Reporting Dashboard</h1>

      <div className="metrics-container">
        {metrics.map((metric) => (
          <div key={metric.name} className="metrics-card">
            <div
              className="metric-icon"
              style={{ backgroundColor: metric.color }}
            ></div>
            <div>
              <h3>{metric.name}</h3>
              <p>{metric.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="charts-section">
        <div className="chart-card">
          <h2>WIP</h2>
          <div className="chart-container">
            <Bar data={wipData} options={options} />
          </div>
        </div>
        <div className="chart-card">
          <h2>Collected Time</h2>
          <div className="chart-container">
            <Line data={collectedTimeData} options={options} />
          </div>
        </div>
        <div className="chart-card">
          <h2>Bills Raised</h2>
          <div className="chart-container">
            <Bar data={billsRaisedData} options={options} />
          </div>
        </div>
        <div className="chart-card">
          <h2>Enquiries Breakdown</h2>
          <div className="chart-container">
            <Pie data={enquiriesData} options={options} />
          </div>
        </div>
        <div className="chart-card">
          <h2>Tasks Overview</h2>
          <div className="chart-container">
            <Doughnut data={tasksData} options={options} />
          </div>
        </div>
        {/* New Chart Card */}
        <div className="chart-card">
          <h2>Matters Opened Breakdown</h2>
          <div className="chart-container">
            <Doughnut data={mattersOpenedData} options={options} />
          </div>
        </div>
      </div>

      <div className="table-container">
        <h2>Recent Activities</h2>
        <table className="reporting-table">
          <thead>
            <tr>
              <th>Activity ID</th>
              <th>Type</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>A001</td>
              <td>New Matter</td>
              <td>2024-04-10</td>
              <td>Opened</td>
            </tr>
            <tr>
              <td>A002</td>
              <td>Bill Raised</td>
              <td>2024-04-12</td>
              <td>Completed</td>
            </tr>
            <tr>
              <td>A003</td>
              <td>Enquiry</td>
              <td>2024-04-15</td>
              <td>Responded</td>
            </tr>
            <tr>
              <td>A004</td>
              <td>Task</td>
              <td>2024-04-18</td>
              <td>Pending</td>
            </tr>
            <tr>
              <td>A005</td>
              <td>Collected Time</td>
              <td>2024-04-20</td>
              <td>Logged</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* New Section: Insights */}
      <div className="insights-section">
        <h2>Key Insights</h2>
        <div className="insights-cards">
          <div className="insight-card">
            <h3>Top Month</h3>
            <p>June - £1M</p>
          </div>
          <div className="insight-card">
            <h3>Most Enquiries</h3>
            <p>RC - 500</p>
          </div>
          <div className="insight-card">
            <h3>Most Completed Tasks</h3>
            <p>LZ - 150</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportingHome;
