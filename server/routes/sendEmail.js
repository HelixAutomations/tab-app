const express = require('express');
const { sendHelixEmail } = require('../utils/helixEmail');

const router = express.Router();

router.post('/sendEmail', async (req, res) => {
  const debugHeader = String(req.get('x-email-debug') || '').toLowerCase();
  const debugQuery = String(req.query?.debug || '').toLowerCase();
  const debug = debugHeader === '1' || debugHeader === 'true' || debugQuery === '1' || debugQuery === 'true';
  const result = await sendHelixEmail({
    body: req.body || {},
    req,
    debug,
    route: 'server:/api/sendEmail',
  });

  if (result.requestId) {
    res.setHeader('X-Email-Request-Id', result.requestId);
  }
  if (result.graphRequestId) {
    res.setHeader('X-Graph-Request-Id', result.graphRequestId);
  }

  if (result.ok) {
    return res.status(result.status || 200).send(result.responseText || 'Email sent');
  }

  if (result.responseKind === 'text') {
    return res.status(result.status || 500).send(result.error || 'Failed to send email');
  }

  return res.status(result.status || 500).json({ error: result.error || 'Failed to send email' });
});

module.exports = router;
