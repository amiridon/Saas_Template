const express = require('express');
const { getConfig } = require('../../../packages/core/config');

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'api' });
});

const config = getConfig();
app.listen(config.API_PORT, () => {
    console.log(`[api] listening on :${config.API_PORT} (${config.APP_ENV})`);
});
