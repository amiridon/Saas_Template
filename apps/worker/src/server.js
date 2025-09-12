const express = require('express');
const { getConfig } = require('../../../packages/core/config');

function createApp() {
    const app = express();
    app.get('/health', (_req, res) => {
        res.status(200).json({ ok: true, service: 'worker' });
    });
    return app;
}

if (require.main === module) {
    // demo background heartbeat
    setInterval(() => {
        process.stdout.write('.');
    }, 5000);

    const config = getConfig();
    const app = createApp();
    app.listen(config.WORKER_PORT, () => {
        console.log(`[worker] listening on :${config.WORKER_PORT} (${config.APP_ENV})`);
    });
}

module.exports = { createApp };
