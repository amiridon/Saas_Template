const express = require('express');
const { getConfig } = require('../../../packages/core/config');

function createApp() {
    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.status(200).json({ ok: true, service: 'api' });
    });
    return app;
}

if (require.main === module) {
    const config = getConfig();
    const app = createApp();
    app.listen(config.API_PORT, () => {
        console.log(`[api] listening on :${config.API_PORT} (${config.APP_ENV})`);
    });
}

module.exports = { createApp };
