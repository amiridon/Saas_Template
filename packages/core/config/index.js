const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const dotenv = require('dotenv');

const schemaPath = path.join(__dirname, 'schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

let cachedConfig = null;

function findEnvUpwards(startDir) {
    let dir = startDir;
    do {
        const candidate = path.join(dir, '.env');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    } while (dir);
    return null;
}

function loadEnv() {
    // In test mode, don't auto-load .env so tests can precisely control process.env
    if (process.env.NODE_ENV === 'test') return;
    const envPath = findEnvUpwards(process.cwd()) || findEnvUpwards(__dirname);
    if (envPath) dotenv.config({ path: envPath });
    else dotenv.config();
}

function validateEnv() {
    const ajv = new Ajv({ useDefaults: true, allErrors: true });
    const validate = ajv.compile(schema);
    const env = Object.assign({}, process.env);
    const valid = validate(env);
    if (!valid) {
        const msg = validate.errors?.map((e) => `${e.instancePath || e.params.missingProperty}: ${e.message}`).join('\n');
        throw new Error(`Invalid configuration:\n${msg}`);
    }
    return env;
}

function getConfig() {
    if (cachedConfig) return cachedConfig;
    loadEnv();
    const env = validateEnv();
    cachedConfig = {
        APP_ENV: env.APP_ENV,
        APP_URL: env.APP_URL,
        API_PORT: Number(env.API_PORT || 4000),
        WEB_PORT: Number(env.WEB_PORT || 3000),
        WORKER_PORT: Number(env.WORKER_PORT || 5000),
        SESSION_SECRET: env.SESSION_SECRET,
        DB_PROVIDER: env.DB_PROVIDER || 'sqlite',
        DB_URL: env.DB_URL || 'data/dev.sqlite'
    };
    return cachedConfig;
}

module.exports = { getConfig };
