const express = require('express');
const { getSecret } = require('../utils/getSecret');

const router = express.Router();

function getLocalSecret(name) {
    const envKey = name.replace(/-/g, '_').toUpperCase();
    return process.env[envKey];
}

router.get('/:name', async (req, res) => {
    const name = req.params.name;
    try {
        if (process.env.USE_LOCAL_SECRETS === 'true') {
            const value = getLocalSecret(name);
            if (!value) {
                return res.status(404).json({ error: 'Secret not found' });
            }
            return res.json({ value });
        }

        const value = await getSecret(name);
        res.json({ value });
    } catch (err) {
        console.error('Failed to retrieve secret', err);
        res.status(500).json({ error: 'Failed to retrieve secret' });
    }
});

module.exports = router;
