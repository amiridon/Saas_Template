const { getConfig } = require('./index');

beforeEach(() => {
    // isolate module cache to re-run config loader cleanly
    delete require.cache[require.resolve('./index')];
});

test('getConfig loads defaults and required values from env', () => {
    process.env.APP_ENV = 'test';
    process.env.APP_URL = 'http://localhost';
    process.env.SESSION_SECRET = 'secretsecret';
    const cfg = getConfig();
    expect(cfg.APP_ENV).toBe('test');
    expect(cfg.API_PORT).toBeGreaterThan(0);
});

test('getConfig fails fast when required env missing', () => {
    // Clear required envs
    delete process.env.APP_ENV;
    delete process.env.APP_URL;
    delete process.env.SESSION_SECRET;
    // Re-require module to reset cache
    const { getConfig: freshGetConfig } = require('./index');
    expect(() => freshGetConfig()).toThrow(/Invalid configuration/i);
});
