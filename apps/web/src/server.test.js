const request = require('supertest');
const { createApp } = require('./server');

describe('web /health', () => {
    it('returns 200', async () => {
        const app = createApp();
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: true, service: 'web' });
    });
});