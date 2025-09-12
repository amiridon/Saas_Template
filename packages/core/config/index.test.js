const { getConfig } = require('./index');

test('getConfig loads defaults and required values from env', () => {
    process.env.APP_ENV = 'test';
    process.env.APP_URL = 'http://localhost';
    process.env.SESSION_SECRET = 'secretsecret';
    const cfg = getConfig();
    expect(cfg.APP_ENV).toBe('test');
    expect(cfg.API_PORT).toBeGreaterThan(0);
});
