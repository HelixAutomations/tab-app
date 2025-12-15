const fs = require('fs');
// invisible change 2
const path = require('path');

const outputPath = path.join(__dirname, '..', 'src', 'localData', 'localAttendance.json');

// Fetch team data from API instead of local file
async function fetchTeamData() {
    // When running locally, hit the local dev server; in production use relative path
    const apiUrl = process.env.API_URL || 'http://localhost:7071/api/team-data';
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch team data: ${response.statusText}`);
    }
    return response.json();
}

function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatWeekRange(monday) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = d => d.toLocaleDateString('en-GB');
    return `Monday, ${fmt(monday)} - Sunday, ${fmt(sunday)}`;
}

function getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    return Math.round(((d.getTime() - week1.getTime()) / 86400000 + 1) / 7) + 1;
}

function randomAttendance() {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const selected = days.filter(() => Math.random() < 0.75);
    return selected.join(',');
}

async function generateAttendance() {
    let team;
    try {
        team = await fetchTeamData();
        console.log('Fetched team data from API:', team.length, 'members');
    } catch (err) {
        console.error('Failed to fetch team data from API. Make sure the API server is running.');
        console.error('Start the backend with: npm run dev:teamsfx (in api folder)');
        console.error('Error:', err.message);
        process.exit(1);
    }
    
    const active = team.filter(m => (m.status || '').toLowerCase() === 'active');

    const now = new Date();
    const currentMonday = startOfWeek(now);
    const nextMonday = new Date(currentMonday); 
    nextMonday.setDate(currentMonday.getDate() + 7);

    const currentRange = formatWeekRange(currentMonday);
    const nextRange = formatWeekRange(nextMonday);

    const output = {
        attendance: active.map(m => ({
            name: m['Full Name'] || `${m.First} ${m.Last}`,
            level: m.Role || '',
            weeks: {
                [currentRange]: { iso: getISOWeek(currentMonday), attendance: randomAttendance() },
                [nextRange]: { iso: getISOWeek(nextMonday), attendance: randomAttendance() }
            }
        })),
        team: active.map(m => ({
            First: m.First,
            Initials: m.Initials,
            'Entra ID': m['Entra ID'],
            Nickname: m.Nickname || ''
        }))
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log('localAttendance.json generated with', output.attendance.length, 'records');
}

generateAttendance();

