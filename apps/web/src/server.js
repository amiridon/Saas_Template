const express = require('express');
const { getConfig } = require('../../../packages/core/config');

const app = express();

app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'web' });
});

app.get('/', (_req, res) => {
    res.type('html').send(`
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>SaaS Starter</title>
      <style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.5}</style>
    </head>
    <body>
      <h1>Welcome to SaaS Starter</h1>
      <p>Phase 0 scaffold is running. Visit <code>/health</code> for status.</p>
    </body>
  </html>
  `);
});

const config = getConfig();
app.listen(config.WEB_PORT, () => {
    console.log(`[web] listening on :${config.WEB_PORT} (${config.APP_ENV})`);
});
