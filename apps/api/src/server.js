const express = require('express');
const { getConfig } = require('../../../packages/core/config');
const { getKnex, migrateLatest, seedRun } = require('../../../packages/db/src');
const { listAllOrganizations } = require('../../../packages/db/src/repos/organizations');

function createApp() {
    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.status(200).json({ ok: true, service: 'api' });
    });

    app.get('/admin/seeded-orgs', async (_req, res) => {
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
        .catch(() => {})
        .finally(() => {
            app.listen(config.API_PORT, () => {
                console.log(`[api] listening on :${config.API_PORT} (${config.APP_ENV})`);
            });
        });
}

module.exports = { createApp };
