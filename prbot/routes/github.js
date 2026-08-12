const express = require('express');
const { verifySignature } = require('../utils/verifySignature');
const handlePullRequest = require('../handlers/pullRequest');

const router = express.Router();

const handlers = {
    pull_request: handlePullRequest,
};

router.post('/github',
    // raw body สำหรับ verify signature — ต้องมาก่อน JSON parsing ใด ๆ
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const signature = req.headers['x-hub-signature-256'];
        if (!verifySignature(req.body, signature)) {
            return res.sendStatus(401);
        }

        const event = req.headers['x-github-event'];
        let payload;
        try {
            payload = JSON.parse(req.body.toString('utf8'));
        } catch (err) {
            return res.sendStatus(400);
        }

        res.sendStatus(202); // ตอบก่อน แล้วค่อยทำงาน (GitHub timeout 10s)

        const handler = handlers[event];
        if (handler) {
            try {
                await handler(payload);
            } catch (err) {
                console.error('[prbot] handler error:', err);
            }
        }
    }
);

module.exports = router;
