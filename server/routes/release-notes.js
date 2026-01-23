const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..');
}

router.get('/', (req, res) => {
  try {
    const filePath = path.join(getRepoRoot(), 'logs', 'changelog.md');
    if (!fs.existsSync(filePath)) {
      return res.status(404).type('text/plain').send('Changelog not found');
    }

    const text = fs.readFileSync(filePath, 'utf8');
    return res
      .status(200)
      .setHeader('Cache-Control', 'no-cache')
      .type('text/plain')
      .send(text);
  } catch (err) {
    console.error('[release-notes] Failed to read changelog:', err);
    return res.status(500).json({ error: 'Failed to load release notes' });
  }
});

module.exports = router;
