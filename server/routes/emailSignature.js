const express = require('express');
const { loadPersonalSignatureHtml } = require('../utils/helixEmail');

const router = express.Router();

router.get('/email-signature', (req, res) => {
  const initials = String(req.query?.initials || '').trim();
  const email = String(req.query?.email || '').trim();
  if (!initials && !email) {
    return res.status(400).json({ error: 'initials or email required' });
  }
  try {
    const html = loadPersonalSignatureHtml({ signatureInitials: initials, fromEmail: email });
    if (!html) {
      return res.status(404).json({ error: 'signature not found', initials, email });
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'failed to load signature' });
  }
});

module.exports = router;
