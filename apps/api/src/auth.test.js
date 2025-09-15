// Ensure minimal env for config
process.env.APP_ENV = 'test';
process.env.APP_URL = 'http://localhost';
process.env.SESSION_SECRET = 'testsecret';
process.env.DB_PROVIDER = 'sqlite';
process.env.DB_URL = ':memory:';

const request = require('supertest');
const { createApp } = require('./server');
const { migrateLatest, rollbackAll, destroy } = require('../../../packages/db/src');

describe('Auth flows', () => {
    const app = createApp();

    beforeAll(async () => {
        await migrateLatest();
    }, 20000);

    afterAll(async () => {
        await rollbackAll();
        await destroy();
    }, 20000);

    it('signup → verify → login → /me', async () => {
        // signup
        const email = `user_${Date.now()}@example.com`;
        const resSignup = await request(app).post('/auth/signup').send({ email, password: 'Password1!' });
        expect(resSignup.status).toBe(201);
        const { user, verifyToken } = resSignup.body;
        expect(user).toBeTruthy();
        expect(verifyToken).toBeTruthy();

        // verify
        const resVerify = await request(app).post('/auth/verify').send({ userId: user.id, token: verifyToken });
        expect(resVerify.status).toBe(200);

        // login
        const resLogin = await request(app).post('/auth/login').send({ email, password: 'Password1!' });
        expect(resLogin.status).toBe(200);
        const cookies = resLogin.headers['set-cookie'];
        expect(cookies).toBeTruthy();

        // me
        const resMe = await request(app).get('/me').set('Cookie', cookies);
        expect(resMe.status).toBe(200);
        expect(resMe.body.user.email).toBe(email);
    });
});
