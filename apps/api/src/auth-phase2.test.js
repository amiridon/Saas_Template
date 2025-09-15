// Ensure minimal env for config
process.env.APP_ENV = 'test';
process.env.APP_URL = 'http://localhost';
process.env.SESSION_SECRET = 'testsecret';
process.env.DB_PROVIDER = 'sqlite';
process.env.DB_URL = ':memory:';

const { createApp } = require('../src/server');
const request = require('supertest');
const { getKnex, migrateLatest, seedRun } = require('../../../packages/db/src');
const crypto = require('crypto');
const speakeasy = require('speakeasy');

describe('Phase 2 Authentication Tests', () => {
    let app;
    let knex;

    beforeAll(async () => {
        app = createApp();
        knex = getKnex();
        await migrateLatest();
        await seedRun();
    }, 20000);

    afterAll(async () => {
        if (knex) {
            await knex.destroy();
        }
    });

    describe('RBAC Middleware', () => {
        let authCookie;
        let userId;
        let orgId;

        beforeEach(async () => {
            // Create test user
            const signupRes = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'rbac-test@example.com',
                    password: 'test123',
                    name: 'RBAC Test User'
                });

            userId = signupRes.body.user.id;

            // Verify user
            await request(app)
                .post('/auth/verify')
                .send({
                    userId: userId,
                    token: signupRes.body.verifyToken
                });

            // Login
            const loginRes = await request(app)
                .post('/auth/login')
                .send({
                    email: 'rbac-test@example.com',
                    password: 'test123'
                });

            authCookie = loginRes.headers['set-cookie'];

            // Create test organization
            orgId = crypto.randomUUID();
            await knex('organizations').insert({
                id: orgId,
                slug: 'test-org-rbac',
                name: 'Test Org RBAC',
                owner_user_id: userId
            });

            // Add membership
            await knex('memberships').insert({
                id: crypto.randomUUID(),
                organization_id: orgId,
                user_id: userId,
                role: 'owner'
            });
        });

        afterEach(async () => {
            await knex('memberships').where({ user_id: userId }).del();
            await knex('organizations').where({ id: orgId }).del();
            await knex('sessions').where({ user_id: userId }).del();
            await knex('users').where({ id: userId }).del();
        });

        test('should access org members with owner role', async () => {
            const res = await request(app)
                .get(`/orgs/${orgId}/members`)
                .set('Cookie', authCookie)
                .set('x-org-id', orgId);

            expect(res.status).toBe(200);
            expect(res.body.members).toHaveLength(1);
            expect(res.body.members[0].email).toBe('rbac-test@example.com');
        });

        test('should deny access without sufficient role', async () => {
            // Change role to member
            await knex('memberships')
                .where({ user_id: userId, organization_id: orgId })
                .update({ role: 'member' });

            const res = await request(app)
                .get(`/orgs/${orgId}/members`)
                .set('Cookie', authCookie)
                .set('x-org-id', orgId);

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('insufficient permissions');
        });

        test('should deny access with invalid org context', async () => {
            // Use a non-existent org ID
            const nonExistentOrgId = 'non-existent-org-id';
            const res = await request(app)
                .get(`/orgs/${nonExistentOrgId}/members`)
                .set('Cookie', authCookie)
                .set('x-org-id', nonExistentOrgId);

            expect(res.status).toBe(404);
            expect(res.body.error).toBe('organization not found');
        });
    });

    describe('2FA Authentication', () => {
        let authCookie;
        let userId;

        beforeEach(async () => {
            // Create and login user
            const signupRes = await request(app)
                .post('/auth/signup')
                .send({
                    email: '2fa-test@example.com',
                    password: 'test123',
                    name: '2FA Test User'
                });

            userId = signupRes.body.user.id;

            await request(app)
                .post('/auth/verify')
                .send({
                    userId: userId,
                    token: signupRes.body.verifyToken
                });

            const loginRes = await request(app)
                .post('/auth/login')
                .send({
                    email: '2fa-test@example.com',
                    password: 'test123'
                });

            authCookie = loginRes.headers['set-cookie'];
        });

        afterEach(async () => {
            await knex('sessions').where({ user_id: userId }).del();
            await knex('users').where({ id: userId }).del();
        });

        test('should setup 2FA and generate QR code', async () => {
            const res = await request(app)
                .post('/auth/2fa/setup')
                .set('Cookie', authCookie);

            expect(res.status).toBe(200);
            expect(res.body.secret).toBeDefined();
            expect(res.body.qrCode).toBeDefined();
            expect(res.body.manualEntryKey).toBeDefined();
        });

        test('should verify 2FA token and enable 2FA', async () => {
            // Setup 2FA
            const setupRes = await request(app)
                .post('/auth/2fa/setup')
                .set('Cookie', authCookie);

            const secret = setupRes.body.secret;

            // Generate valid TOTP token
            const token = speakeasy.totp({
                secret: secret,
                encoding: 'base32'
            });

            // Verify token
            const verifyRes = await request(app)
                .post('/auth/2fa/verify')
                .set('Cookie', authCookie)
                .send({ token });

            expect(verifyRes.status).toBe(200);
            expect(verifyRes.body.ok).toBe(true);
            expect(verifyRes.body.backupCodes).toHaveLength(10);

            // Check user has 2FA enabled
            const user = await knex('users').where({ id: userId }).first();
            expect(user.totp_enabled).toBe(1); // SQLite stores boolean as integer
        });

        test('should disable 2FA with password', async () => {
            // Enable 2FA first
            const setupRes = await request(app)
                .post('/auth/2fa/setup')
                .set('Cookie', authCookie);

            const token = speakeasy.totp({
                secret: setupRes.body.secret,
                encoding: 'base32'
            });

            await request(app)
                .post('/auth/2fa/verify')
                .set('Cookie', authCookie)
                .send({ token });

            // Disable 2FA
            const disableRes = await request(app)
                .post('/auth/2fa/disable')
                .set('Cookie', authCookie)
                .send({ password: 'test123' });

            expect(disableRes.status).toBe(200);
            expect(disableRes.body.ok).toBe(true);

            // Check user has 2FA disabled
            const user = await knex('users').where({ id: userId }).first();
            expect(user.totp_enabled).toBe(0); // SQLite stores boolean as integer
            expect(user.totp_secret).toBe(null);
        });
    });

    describe('Magic Link Authentication', () => {
        let userId;

        beforeEach(async () => {
            // Create user
            const signupRes = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'magic-test@example.com',
                    password: 'test123',
                    name: 'Magic Link Test'
                });

            userId = signupRes.body.user.id;

            await request(app)
                .post('/auth/verify')
                .send({
                    userId: userId,
                    token: signupRes.body.verifyToken
                });
        });

        afterEach(async () => {
            await knex('email_tokens').where({ user_id: userId }).del();
            await knex('sessions').where({ user_id: userId }).del();
            await knex('users').where({ id: userId }).del();
        });

        test('should send magic link', async () => {
            const res = await request(app)
                .post('/auth/magic-link')
                .send({ email: 'magic-test@example.com' });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.magicLink).toBeDefined();

            // Check token was created
            const token = await knex('email_tokens')
                .where({ user_id: userId, purpose: 'magic-link' })
                .first();
            expect(token).toBeDefined();
        });

        test('should login with valid magic link', async () => {
            // Send magic link
            const magicRes = await request(app)
                .post('/auth/magic-link')
                .send({ email: 'magic-test@example.com' });

            const magicLink = magicRes.body.magicLink;
            const url = new URL(magicLink);
            const token = url.searchParams.get('token');
            const userIdParam = url.searchParams.get('userId');

            // Verify magic link
            const verifyRes = await request(app)
                .get(`/auth/magic-link/verify?token=${token}&userId=${userIdParam}`);

            expect(verifyRes.status).toBe(200);
            expect(verifyRes.body.ok).toBe(true);
            expect(verifyRes.headers['set-cookie']).toBeDefined();

            // Check session was created
            const session = await knex('sessions').where({ user_id: userId }).first();
            expect(session).toBeDefined();
        });

        test('should reject invalid magic link', async () => {
            const res = await request(app)
                .get('/auth/magic-link/verify?token=invalid&userId=' + userId);

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('invalid or expired magic link');
        });
    });

    describe('OAuth Authentication', () => {
        test('should handle OAuth provider request', async () => {
            const res = await request(app)
                .get('/auth/oauth/google');

            // Should either redirect (if configured) or return error (if not configured)
            expect([302, 500]).toContain(res.status);
        });

        test('should reject unsupported OAuth provider', async () => {
            const res = await request(app)
                .get('/auth/oauth/facebook');

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('unsupported OAuth provider');
        });

        test('should handle OAuth callback error', async () => {
            const res = await request(app)
                .get('/auth/oauth/google/callback?error=access_denied');

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('OAuth error');
        });
    });

    describe('Enhanced Session Tracking', () => {
        test('should track IP and user agent in session metadata', async () => {
            const signupRes = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'session-test@example.com',
                    password: 'test123',
                    name: 'Session Test'
                });

            const userId = signupRes.body.user.id;

            await request(app)
                .post('/auth/verify')
                .send({
                    userId: userId,
                    token: signupRes.body.verifyToken
                });

            // Login with custom user agent
            const loginRes = await request(app)
                .post('/auth/login')
                .set('User-Agent', 'Test Browser 1.0')
                .send({
                    email: 'session-test@example.com',
                    password: 'test123'
                });

            expect(loginRes.status).toBe(200);

            // Check session metadata
            const session = await knex('sessions').where({ user_id: userId }).first();
            expect(session.metadata).toBeDefined();

            const metadata = JSON.parse(session.metadata);
            expect(metadata.userAgent).toBe('Test Browser 1.0');
            expect(metadata.createdAt).toBeDefined();

            // Cleanup
            await knex('sessions').where({ user_id: userId }).del();
            await knex('users').where({ id: userId }).del();
        });
    });

    describe('Organization Management with RBAC', () => {
        let ownerCookie, memberCookie;
        let ownerId, memberId, orgId;

        beforeEach(async () => {
            // Create owner user
            const ownerSignup = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'owner@example.com',
                    password: 'test123',
                    name: 'Owner User'
                });

            ownerId = ownerSignup.body.user.id;

            await request(app)
                .post('/auth/verify')
                .send({
                    userId: ownerId,
                    token: ownerSignup.body.verifyToken
                });

            const ownerLogin = await request(app)
                .post('/auth/login')
                .send({
                    email: 'owner@example.com',
                    password: 'test123'
                });

            ownerCookie = ownerLogin.headers['set-cookie'];

            // Create member user
            const memberSignup = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'member@example.com',
                    password: 'test123',
                    name: 'Member User'
                });

            memberId = memberSignup.body.user.id;

            await request(app)
                .post('/auth/verify')
                .send({
                    userId: memberId,
                    token: memberSignup.body.verifyToken
                });

            const memberLogin = await request(app)
                .post('/auth/login')
                .send({
                    email: 'member@example.com',
                    password: 'test123'
                });

            memberCookie = memberLogin.headers['set-cookie'];

            // Create organization
            orgId = crypto.randomUUID();
            await knex('organizations').insert({
                id: orgId,
                slug: 'test-org-management',
                name: 'Test Org Management',
                owner_user_id: ownerId
            });

            // Add memberships
            await knex('memberships').insert([
                {
                    id: crypto.randomUUID(),
                    organization_id: orgId,
                    user_id: ownerId,
                    role: 'owner'
                },
                {
                    id: crypto.randomUUID(),
                    organization_id: orgId,
                    user_id: memberId,
                    role: 'member'
                }
            ]);
        });

        afterEach(async () => {
            await knex('memberships').whereIn('user_id', [ownerId, memberId]).del();
            await knex('organizations').where({ id: orgId }).del();
            await knex('sessions').whereIn('user_id', [ownerId, memberId]).del();
            await knex('users').whereIn('id', [ownerId, memberId]).del();
        });

        test('should allow owner to add new members', async () => {
            // Create another user to add
            const newUserSignup = await request(app)
                .post('/auth/signup')
                .send({
                    email: 'newmember@example.com',
                    password: 'test123',
                    name: 'New Member'
                });

            const newUserId = newUserSignup.body.user.id;

            await request(app)
                .post('/auth/verify')
                .send({
                    userId: newUserId,
                    token: newUserSignup.body.verifyToken
                });

            // Owner adds new member
            const res = await request(app)
                .post(`/orgs/${orgId}/members`)
                .set('Cookie', ownerCookie)
                .set('x-org-id', orgId)
                .send({
                    email: 'newmember@example.com',
                    role: 'member'
                });

            expect(res.status).toBe(201);
            expect(res.body.ok).toBe(true);
            expect(res.body.member.email).toBe('newmember@example.com');

            // Cleanup
            await knex('memberships').where({ user_id: newUserId }).del();
            await knex('sessions').where({ user_id: newUserId }).del();
            await knex('users').where({ id: newUserId }).del();
        });

        test('should deny member from adding new members', async () => {
            const res = await request(app)
                .post(`/orgs/${orgId}/members`)
                .set('Cookie', memberCookie)
                .set('x-org-id', orgId)
                .send({
                    email: 'another@example.com',
                    role: 'member'
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toBe('insufficient permissions');
        });
    });
});