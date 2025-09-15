const express = require('express');
const { getConfig } = require('../../../packages/core/config');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getKnex, migrateLatest, seedRun } = require('../../../packages/db/src');
const { listAllOrganizations } = require('../../../packages/db/src/repos/organizations');
const { createUser, findUserByEmail, findUserById, markEmailVerified } = require('../../../packages/db/src/repos/users');
const { createSession, findSession, deleteSession } = require('../../../packages/db/src/repos/sessions');
const { createEmailToken, findValidEmailToken, markTokenUsed } = require('../../../packages/db/src/repos/emailTokens');
const { requireAuth, optionalAuth, requireOrg, requireRole, requirePermission, requireOwnershipOrRole } = require('./middleware/auth');
const OAuthService = require('./services/oauth');

function createApp() {
    const app = express();
    app.use(express.json());
    const cfg = getConfig();
    app.use(cors({ origin: cfg.APP_URL, credentials: true }));
    app.use(cookieParser());

    const oauthService = new OAuthService();

    app.get('/health', (_req, res) => {
        res.status(200).json({ ok: true, service: 'api' });
    });

    // Minimal auth helpers
    function hash(input) {
        return crypto.createHash('sha256').update(input).digest('hex');
    }

    // Enhanced session creation with IP and UA tracking
    async function createSessionWithTracking(knex, userId, refreshHash, expiresAt, req) {
        const metadata = {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            createdAt: new Date().toISOString()
        };

        return await createSession(knex, userId, refreshHash, expiresAt, metadata);
    }

    app.post('/auth/signup', async (req, res) => {
        const { email, password, name } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email and password required' });
        const knex = getKnex();
        const existing = await findUserByEmail(knex, email);
        if (existing) return res.status(409).json({ error: 'email in use' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await createUser(knex, { email, passwordHash, name });
        // create verify token
        const token = crypto.randomBytes(20).toString('hex');
        const tokenHash = hash(token);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
        await createEmailToken(knex, user.id, 'verify', tokenHash, expiresAt);
        // For demo, return token (in real app, email it)
        res.status(201).json({ user: { id: user.id, email: user.email }, verifyToken: token });
    });

    app.post('/auth/verify', async (req, res) => {
        const { userId, token } = req.body || {};
        if (!userId || !token) return res.status(400).json({ error: 'userId and token required' });
        const knex = getKnex();
        const tokenHash = hash(token);
        const row = await findValidEmailToken(knex, userId, 'verify', tokenHash);
        if (!row) return res.status(400).json({ error: 'invalid or expired token' });
        await markTokenUsed(knex, row.id);
        await markEmailVerified(knex, userId);
        res.json({ ok: true });
    });

    app.post('/auth/login', async (req, res) => {
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ error: 'email and password required' });
        const knex = getKnex();
        const user = await findUserByEmail(knex, email);
        if (!user) return res.status(401).json({ error: 'invalid credentials' });
        const ok = await bcrypt.compare(password, user.password_hash || '');
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });
        // issue session cookie (simplified refresh token hash as cookie value)
        const refresh = crypto.randomBytes(32).toString('hex');
        const refreshHash = hash(refresh);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
        await createSessionWithTracking(knex, user.id, refreshHash, expiresAt, req);
        res.cookie('sid', refreshHash, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
        res.json({ ok: true });
    });

    app.post('/auth/logout', requireAuth, async (req, res) => {
        const sid = req.cookies.sid;
        const knex = getKnex();
        await knex('sessions').where({ refresh_token_hash: sid }).del();
        res.clearCookie('sid');
        res.json({ ok: true });
    });

    app.get('/me', requireAuth, async (req, res) => {
        const knex = getKnex();
        const user = await findUserById(knex, req.user.id);
        res.json({ user: { id: user.id, email: user.email, name: user.name, email_verified: user.email_verified } });
    });

    // password reset (demo: returns token)
    app.post('/auth/forgot', async (req, res) => {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ error: 'email required' });
        const knex = getKnex();
        const user = await findUserByEmail(knex, email);
        if (!user) return res.json({ ok: true }); // do not reveal
        const token = crypto.randomBytes(20).toString('hex');
        const tokenHash = hash(token);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
        await createEmailToken(knex, user.id, 'reset', tokenHash, expiresAt);
        res.json({ ok: true, resetToken: token });
    });

    app.post('/auth/reset', async (req, res) => {
        const { userId, token, newPassword } = req.body || {};
        if (!userId || !token || !newPassword) return res.status(400).json({ error: 'missing fields' });
        const knex = getKnex();
        const tokenHash = hash(token);
        const row = await findValidEmailToken(knex, userId, 'reset', tokenHash);
        if (!row) return res.status(400).json({ error: 'invalid or expired token' });
        await markTokenUsed(knex, row.id);
        const password_hash = await bcrypt.hash(newPassword, 10);
        await knex('users').where({ id: userId }).update({ password_hash });
        res.json({ ok: true });
    });

    // ===== 2FA ROUTES =====
    app.post('/auth/2fa/setup', requireAuth, async (req, res) => {
        try {
            const secret = speakeasy.generateSecret({
                name: `SaaS Template (${req.user.email})`,
                issuer: 'SaaS Template',
                length: 20
            });

            const knex = getKnex();
            await knex('users').where({ id: req.user.id }).update({
                totp_secret: secret.base32,
                totp_enabled: false // Not enabled until verified
            });

            const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

            res.json({
                secret: secret.base32,
                qrCode: qrCodeUrl,
                manualEntryKey: secret.base32
            });
        } catch (error) {
            console.error('2FA setup error:', error);
            res.status(500).json({ error: 'failed to setup 2FA' });
        }
    });

    app.post('/auth/2fa/verify', requireAuth, async (req, res) => {
        try {
            const { token } = req.body;
            if (!token) return res.status(400).json({ error: 'token required' });

            const knex = getKnex();
            const user = await findUserById(knex, req.user.id);

            if (!user.totp_secret) {
                return res.status(400).json({ error: '2FA not set up' });
            }

            const verified = speakeasy.totp.verify({
                secret: user.totp_secret,
                encoding: 'base32',
                token: token,
                window: 2
            });

            if (!verified) {
                return res.status(400).json({ error: 'invalid token' });
            }

            // Enable 2FA and generate backup codes
            const backupCodes = Array.from({ length: 10 }, () =>
                crypto.randomBytes(4).toString('hex').toUpperCase()
            );

            await knex('users').where({ id: req.user.id }).update({
                totp_enabled: true,
                backup_codes: JSON.stringify(backupCodes)
            });

            res.json({ ok: true, backupCodes });
        } catch (error) {
            console.error('2FA verify error:', error);
            res.status(500).json({ error: 'failed to verify 2FA' });
        }
    });

    app.post('/auth/2fa/disable', requireAuth, async (req, res) => {
        try {
            const { password } = req.body;
            if (!password) return res.status(400).json({ error: 'password required' });

            const knex = getKnex();
            const user = await findUserById(knex, req.user.id);

            const passwordValid = await bcrypt.compare(password, user.password_hash || '');
            if (!passwordValid) {
                return res.status(401).json({ error: 'invalid password' });
            }

            await knex('users').where({ id: req.user.id }).update({
                totp_secret: null,
                totp_enabled: false,
                backup_codes: null
            });

            res.json({ ok: true });
        } catch (error) {
            console.error('2FA disable error:', error);
            res.status(500).json({ error: 'failed to disable 2FA' });
        }
    });

    // ===== MAGIC LINK ROUTES =====
    app.post('/auth/magic-link', async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'email required' });

            const knex = getKnex();
            const user = await findUserByEmail(knex, email);

            if (!user) {
                // Don't reveal if user exists
                return res.json({ ok: true, message: 'If the email exists, a magic link has been sent' });
            }

            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = hash(token);
            const expiresAt = new Date(Date.now() + 1000 * 60 * 15).toISOString(); // 15 min expiry

            await createEmailToken(knex, user.id, 'magic-link', tokenHash, expiresAt);

            // In real app, send email with magic link
            const config = getConfig();
            const magicLink = `${config.APP_URL}/auth/magic-link/verify?token=${token}&userId=${user.id}`;

            res.json({
                ok: true,
                message: 'Magic link sent to your email',
                // For demo purposes, include the link
                magicLink: magicLink
            });
        } catch (error) {
            console.error('Magic link error:', error);
            res.status(500).json({ error: 'failed to send magic link' });
        }
    });

    app.get('/auth/magic-link/verify', async (req, res) => {
        try {
            const { token, userId } = req.query;
            if (!token || !userId) {
                return res.status(400).json({ error: 'token and userId required' });
            }

            const knex = getKnex();
            const tokenHash = hash(token);
            const tokenRecord = await findValidEmailToken(knex, userId, 'magic-link', tokenHash);

            if (!tokenRecord) {
                return res.status(400).json({ error: 'invalid or expired magic link' });
            }

            await markTokenUsed(knex, tokenRecord.id);

            // Create session
            const refresh = crypto.randomBytes(32).toString('hex');
            const refreshHash = hash(refresh);
            const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
            await createSessionWithTracking(knex, userId, refreshHash, expiresAt, req);

            res.cookie('sid', refreshHash, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production'
            });

            res.json({ ok: true, message: 'Successfully logged in via magic link' });
        } catch (error) {
            console.error('Magic link verify error:', error);
            res.status(500).json({ error: 'failed to verify magic link' });
        }
    });

    // ===== OAUTH ROUTES =====
    app.get('/auth/oauth/:provider', (req, res) => {
        try {
            const { provider } = req.params;

            if (!['google', 'microsoft'].includes(provider)) {
                return res.status(400).json({ error: 'unsupported OAuth provider' });
            }

            const config = getConfig();
            const redirectUri = `${config.API_URL}/auth/oauth/${provider}/callback`;

            const { authUrl, state } = oauthService.generateAuthUrl(provider, redirectUri);

            // Store state in session for validation (in production, use proper session storage)
            res.cookie(`oauth_state_${provider}`, state, {
                httpOnly: true,
                maxAge: 10 * 60 * 1000, // 10 minutes
                secure: process.env.NODE_ENV === 'production'
            });

            // Redirect to OAuth provider
            res.redirect(authUrl);
        } catch (error) {
            console.error(`OAuth ${req.params.provider} redirect error:`, error);
            res.status(500).json({ error: 'OAuth redirect failed' });
        }
    });

    app.get('/auth/oauth/:provider/callback', async (req, res) => {
        try {
            const { provider } = req.params;
            const { code, state, error: oauthError } = req.query;

            if (oauthError) {
                return res.status(400).json({ error: `OAuth error: ${oauthError}` });
            }

            if (!code) {
                return res.status(400).json({ error: 'authorization code required' });
            }

            // Validate state parameter (CSRF protection)
            const storedState = req.cookies[`oauth_state_${provider}`];
            if (!storedState || storedState !== state) {
                return res.status(400).json({ error: 'invalid OAuth state' });
            }

            const config = getConfig();
            const redirectUri = `${config.API_URL}/auth/oauth/${provider}/callback`;

            // Handle OAuth flow
            const { userInfo } = await oauthService.handleOAuthFlow(provider, code, redirectUri);

            const knex = getKnex();
            let user = await findUserByEmail(knex, userInfo.email);

            if (!user) {
                // Create new user from OAuth
                user = await createUser(knex, {
                    email: userInfo.email,
                    name: userInfo.name,
                    email_verified: userInfo.verified_email,
                    oauth_provider: provider,
                    oauth_provider_id: userInfo.id,
                    image_url: userInfo.picture
                });
            } else if (!user.oauth_provider) {
                // Link OAuth to existing account
                await knex('users').where({ id: user.id }).update({
                    oauth_provider: provider,
                    oauth_provider_id: userInfo.id,
                    email_verified: userInfo.verified_email || user.email_verified
                });
            }

            // Create session
            const refresh = crypto.randomBytes(32).toString('hex');
            const refreshHash = hash(refresh);
            const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
            await createSessionWithTracking(knex, user.id, refreshHash, expiresAt, req);

            // Clear OAuth state cookie
            res.clearCookie(`oauth_state_${provider}`);

            // Set session cookie
            res.cookie('sid', refreshHash, {
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production'
            });

            // Redirect to frontend success page
            res.redirect(`${config.APP_URL}/auth/success?provider=${provider}`);
        } catch (error) {
            console.error(`OAuth ${req.params.provider} callback error:`, error);
            const config = getConfig();
            res.redirect(`${config.APP_URL}/auth/error?message=${encodeURIComponent(error.message)}`);
        }
    });

    // ===== ORGANIZATION ROUTES WITH RBAC =====
    app.get('/orgs', requireAuth, async (req, res) => {
        try {
            const knex = getKnex();
            const memberships = await knex('memberships')
                .join('organizations', 'organizations.id', 'memberships.organization_id')
                .where({ 'memberships.user_id': req.user.id })
                .select('organizations.*', 'memberships.role');

            res.json({ organizations: memberships });
        } catch (error) {
            console.error('List orgs error:', error);
            res.status(500).json({ error: 'failed to list organizations' });
        }
    });

    app.get('/orgs/:orgId/members', requireAuth, requireOrg, requireRole(['admin', 'owner']), async (req, res) => {
        try {
            const knex = getKnex();
            const members = await knex('memberships')
                .join('users', 'users.id', 'memberships.user_id')
                .where({ 'memberships.organization_id': req.orgId })
                .select('users.id', 'users.email', 'users.name', 'memberships.role', 'memberships.created_at');

            res.json({ members });
        } catch (error) {
            console.error('List members error:', error);
            res.status(500).json({ error: 'failed to list members' });
        }
    });

    app.post('/orgs/:orgId/members', requireAuth, requireOrg, requireRole(['owner']), async (req, res) => {
        try {
            const { email, role = 'member' } = req.body;
            if (!email) return res.status(400).json({ error: 'email required' });

            const knex = getKnex();
            const user = await findUserByEmail(knex, email);

            if (!user) {
                return res.status(404).json({ error: 'user not found' });
            }

            const existingMembership = await knex('memberships')
                .where({ user_id: user.id, organization_id: req.orgId })
                .first();

            if (existingMembership) {
                return res.status(409).json({ error: 'user already a member' });
            }

            await knex('memberships').insert({
                user_id: user.id,
                organization_id: req.orgId,
                role: role
            });

            res.status(201).json({
                ok: true,
                member: { id: user.id, email: user.email, role: role }
            });
        } catch (error) {
            console.error('Add member error:', error);
            res.status(500).json({ error: 'failed to add member' });
        }
    });

    app.get('/admin/seeded-orgs', requireAuth, requirePermission('analytics.read'), async (_req, res) => {
        try {
            const knex = getKnex();
            const rows = await listAllOrganizations(knex);
            res.json({ organizations: rows });
        } catch (err) {
            res.status(500).json({ error: 'Failed to list organizations' });
        }
    });
    return app;
}

if (require.main === module) {
    const config = getConfig();
    const app = createApp();
    // ensure DB is migrated/seeded in dev to make demo endpoint work
    migrateLatest()
        .then(async () => {
            if (['development', 'test'].includes(config.APP_ENV)) {
                await seedRun();
            }
        })
        .catch(() => { })
        .finally(() => {
            app.listen(config.API_PORT, () => {
                console.log(`[api] listening on :${config.API_PORT} (${config.APP_ENV})`);
            });
        });
}

module.exports = { createApp };
