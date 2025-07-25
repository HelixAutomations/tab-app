const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local'), override: false });
const express = require('express');
const morgan = require('morgan');
const keysRouter = require('./routes/keys');
const refreshRouter = require('./routes/refresh');
const matterRequestsRouter = require('./routes/matterRequests');
const opponentsRouter = require('./routes/opponents');
const clioContactsRouter = require('./routes/clioContacts');
const clioMattersRouter = require('./routes/clioMatters');
const mattersRouter = require('./routes/matters');
const riskAssessmentsRouter = require('./routes/riskAssessments');
const { router: cclRouter, CCL_DIR } = require('./routes/ccl');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(morgan('dev'));
app.use(express.json());

app.use('/api/keys', keysRouter);
app.use('/api/refresh', refreshRouter);
app.use('/api/matter-requests', matterRequestsRouter);
app.use('/api/opponents', opponentsRouter);
app.use('/api/risk-assessments', riskAssessmentsRouter);
app.use('/api/clio-contacts', clioContactsRouter);
app.use('/api/clio-matters', clioMattersRouter);
app.use('/api/matters', mattersRouter);
app.use('/api/ccl', cclRouter);
app.use('/ccls', express.static(CCL_DIR));

const buildPath = path.join(__dirname, 'static');
app.use(express.static(buildPath));

app.get('*', (_req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});