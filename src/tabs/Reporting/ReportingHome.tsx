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
import { Stack, Text, mergeStyles } from '@fluentui/react';
import { useTheme } from '../../app/functionality/ThemeContext'; // <— For theming
import { colours } from '../../app/styles/colours';              // <— Helix color tokens
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

// Optional type for props
interface ReportingHomeProps {
  // If you wanted to pass in real data from the App:
  enquiriesCount?: number;
  mattersCount?: number;
}

const ReportingHome: React.FC<ReportingHomeProps> = ({
  enquiriesCount = 120, // default dummy
  mattersCount = 45,    // default dummy
}) => {
  const { isDarkMode } = useTheme();

  // Example “KPI cards” data:
  const kpiCards = [
    { label: 'Enquiries', value: enquiriesCount },
    { label: 'Matters', value: mattersCount },
    { label: 'Conversion Rate', value: '23%' },
    { label: 'Avg. Time to Close', value: '14 days' },
  ];

  // Sample data for the Bar chart
  const barData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'Enquiries',
        data: [65, 59, 80, 81, 56],
        backgroundColor: 'rgba(75,192,192,0.4)',
        borderColor: 'rgba(75,192,192,1)',
        borderWidth: 1,
      },
    ],
  };

  // Sample data for the Line chart
  const lineData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    datasets: [
      {
        label: 'Matters Opened',
        data: [25, 45, 40, 70, 54],
        fill: false,
        borderColor: 'rgba(153, 102, 255, 1)',
        tension: 0.1,
      },
    ],
  };

  // Chart.js options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: isDarkMode ? colours.dark.text : colours.light.text,
          font: { family: 'Raleway, sans-serif' },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: isDarkMode ? colours.dark.text : colours.light.text,
          font: { family: 'Raleway, sans-serif' },
        },
        grid: { color: isDarkMode ? colours.dark.border : '#e0e0e0' },
      },
      y: {
        ticks: {
          color: isDarkMode ? colours.dark.text : colours.light.text,
          font: { family: 'Raleway, sans-serif' },
        },
        grid: { color: isDarkMode ? colours.dark.border : '#e0e0e0' },
      },
    },
  };

  return (
    <div
      className={mergeStyles('reporting-home-container', {
        backgroundColor: isDarkMode
          ? colours.dark.background
          : colours.light.background,
      })}
    >
      <Text
        variant="xxLarge"
        styles={{
          root: {
            marginBottom: '20px',
            color: isDarkMode ? colours.dark.text : colours.light.text,
            fontFamily: 'Raleway, sans-serif',
            fontWeight: 700,
          },
        }}
      >
        Reporting Dashboard
      </Text>

      {/* KPI Cards */}
      <Stack horizontal wrap tokens={{ childrenGap: 20 }} style={{ marginBottom: 30 }}>
        {kpiCards.map((card) => (
          <div className="kpi-card" key={card.label}>
            <Text variant="large" styles={{ root: { fontWeight: 600 } }}>
              {card.label}
            </Text>
            <Text
              variant="xxLarge"
              styles={{ root: { fontWeight: 700, color: colours.highlight } }}
            >
              {card.value}
            </Text>
          </div>
        ))}
      </Stack>

      <div className="cards-container">
        {/* Sales/Enquiries Overview (Bar Chart) */}
        <div className="reporting-card">
          <h2>Enquiries Overview</h2>
          <div className="chart-container">
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>

        {/* Matters/Performance (Line Chart) */}
        <div className="reporting-card">
          <h2>Matters Performance</h2>
          <div className="chart-container">
            <Line data={lineData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Table container */}
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
