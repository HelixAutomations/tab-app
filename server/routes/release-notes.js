const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

function getChangelogPath() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'logs', 'changelog.md'),
    path.resolve(__dirname, '..', 'logs', 'changelog.md'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

router.get('/', (req, res) => {
  try {
    const filePath = getChangelogPath();
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
