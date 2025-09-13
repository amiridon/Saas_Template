// Ensure required env present for config during tests before requiring modules
process.env.APP_ENV = process.env.APP_ENV || 'test';
process.env.APP_URL = process.env.APP_URL || 'http://localhost';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

const request = require('supertest');
const { createApp } = require('./server');
const { migrateLatest, seedRun, rollbackAll, destroy } = require('../../../packages/db/src');

describe('GET /admin/seeded-orgs', () => {
  const app = createApp();

  beforeAll(async () => {
    await migrateLatest();
    await seedRun();
  }, 20000);

  afterAll(async () => {
    await rollbackAll();
    await destroy();
  }, 20000);

  it('returns seeded organizations', async () => {
    const res = await request(app).get('/admin/seeded-orgs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('organizations');
    const slugs = res.body.organizations.map((o) => o.slug).sort();
    expect(slugs).toEqual(['alpha', 'beta']);
  });
});
