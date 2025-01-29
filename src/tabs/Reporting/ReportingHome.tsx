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
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import './ReportingHome.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement
);

const ReportingHome: React.FC = () => {
  // Sample data for charts
  const data = {
    labels: ['January', 'February', 'March', 'April', 'May'],
    datasets: [
      {
        label: 'Sales',
        data: [65, 59, 80, 81, 56],
        backgroundColor: 'rgba(75,192,192,0.4)',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
  };

  return (
    <div className="reporting-home-container">
      <h1>Reporting Dashboard</h1>
      <div className="cards-container">
        <div className="reporting-card">
          <h2>Sales Overview</h2>
          <div className="chart-container">
            <Bar data={data} options={options} />
          </div>
        </div>
        <div className="reporting-card">
          <h2>Performance Metrics</h2>
          <div className="chart-container">
            <Line data={data} options={options} />
          </div>
        </div>
      </div>
      <div className="table-container">
        <h2>Recent Reports</h2>
        <table className="reporting-table">
          <thead>
            <tr>
              <th>Report ID</th>
              <th>Title</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>001</td>
              <td>Sales Q1</td>
              <td>2024-01-15</td>
              <td>Completed</td>
            </tr>
            <tr>
              <td>002</td>
              <td>Market Analysis</td>
              <td>2024-02-20</td>
              <td>In Progress</td>
            </tr>
            <tr>
              <td>003</td>
              <td>Customer Feedback</td>
              <td>2024-03-10</td>
              <td>Pending</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportingHome;