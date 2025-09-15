const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getConfig } = require('../../../packages/core/config');

function createApp() {
    const app = express();
    const cfg = getConfig();
    const apiBase = `http://localhost:${cfg.API_PORT}`;
    app.use(express.urlencoded({ extended: true }));

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
      <style>body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.5} input{display:block;margin:8px 0;padding:8px;width:260px} a{color:#0366d6}</style>
    </head>
    <body>
      <h1>Welcome to SaaS Starter</h1>
      <p><a href="/signup">Sign up</a> · <a href="/login">Log in</a> · <a href="/me">Me</a></p>
    </body>
  </html>
  `);
    });

    app.get('/signup', (_req, res) => {
        res.type('html').send(`
      <h2>Sign up</h2>
      <form method="post" action="/signup">
        <input name="email" type="email" placeholder="email" required />
        <input name="password" type="password" placeholder="password" required />
        <button type="submit">Create account</button>
      </form>
      <p><a href="/">Home</a></p>
    `);
    });
    app.post('/signup', async (req, res) => {
        const r = await fetch(`${apiBase}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: req.body.email, password: req.body.password }) });
        const data = await r.json();
        if (!r.ok) return res.status(400).send(`<p>Signup failed: ${data.error || 'unknown'} <a href="/signup">try again</a></p>`);
        res.type('html').send(`
      <h2>Verify email</h2>
      <p>Copy + submit to verify (emailed in real app)</p>
      <form method="post" action="/verify">
        <input name="userId" type="text" value="${data.user.id}" />
        <input name="token" type="text" value="${data.verifyToken}" />
        <button type="submit">Verify</button>
      </form>
      <p><a href="/">Home</a></p>
    `);
    });

    app.post('/verify', async (req, res) => {
        const r = await fetch(`${apiBase}/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: req.body.userId, token: req.body.token }) });
        const data = await r.json();
        if (!r.ok) return res.status(400).send(`<p>Verify failed: ${data.error || 'unknown'} <a href="/signup">back</a></p>`);
        res.redirect('/login');
    });

    app.get('/login', (_req, res) => {
        res.type('html').send(`
      <h2>Log in</h2>
      <form method="post" action="/login">
        <input name="email" type="email" placeholder="email" required />
        <input name="password" type="password" placeholder="password" required />
        <button type="submit">Login</button>
      </form>
      <p><a href="/">Home</a></p>
    `);
    });
    app.post('/login', async (req, res) => {
        const r = await fetch(`${apiBase}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: req.body.email, password: req.body.password }), redirect: 'manual' });
        const setCookie = r.headers.get('set-cookie');
        if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            return res.status(400).send(`<p>Login failed: ${data.error || 'unknown'} <a href="/login">try again</a></p>`);
        }
        if (setCookie) res.setHeader('set-cookie', setCookie.replace(/; Path=\//i, ''));
        res.redirect('/me');
    });

    app.get('/me', async (req, res) => {
        const cookieHeader = req.headers.cookie || '';
        const r = await fetch(`${apiBase}/me`, { headers: { cookie: cookieHeader }, redirect: 'manual' });
        if (r.status === 401) return res.redirect('/login');
        const data = await r.json();
        res.type('html').send(`<h2>Me</h2><pre>${JSON.stringify(data, null, 2)}</pre><form method="post" action="/logout"><button type="submit">Logout</button></form><p><a href="/">Home</a></p>`);
    });
    app.post('/logout', async (req, res) => {
        const cookieHeader = req.headers.cookie || '';
        await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers: { cookie: cookieHeader } });
        res.setHeader('set-cookie', 'sid=; Max-Age=0');
        res.redirect('/');
    });
    return app;
}

if (require.main === module) {
    const config = getConfig();
    const app = createApp();
    app.listen(config.WEB_PORT, () => {
        console.log(`[web] listening on :${config.WEB_PORT} (${config.APP_ENV})`);
    });
}

module.exports = { createApp };
