const express = require('express');
const { getConfig } = require('../../../packages/core/config');

const app = express();

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'worker' });
});

// demo background heartbeat
setInterval(() => {
    process.stdout.write('.');
}, 5000);

const config = getConfig();
app.listen(config.WORKER_PORT, () => {
    console.log(`[worker] listening on :${config.WORKER_PORT} (${config.APP_ENV})`);
});
