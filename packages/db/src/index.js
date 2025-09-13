const fs = require('fs');
const path = require('path');
const knexLib = require('knex');
const { getConfig } = require('../../core/config');

let knexInstance = null;

function ensureSqliteDir(dbUrl) {
  // if using a file-based sqlite URL, ensure its directory exists
  const filename = path.resolve(process.cwd(), dbUrl);
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return filename;
}

function getKnex() {
  if (knexInstance) return knexInstance;
  const cfg = getConfig();
  let client = cfg.DB_PROVIDER === 'sqlite' ? 'better-sqlite3' : cfg.DB_PROVIDER;
  let connection = cfg.DB_URL;
  if (cfg.DB_PROVIDER === 'sqlite') {
    const filename = ensureSqliteDir(cfg.DB_URL);
    connection = { filename };
  }
  knexInstance = knexLib({
    client,
    connection,
    useNullAsDefault: cfg.DB_PROVIDER === 'sqlite',
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, '..', 'migrations')
    },
    seeds: {
      directory: path.join(__dirname, '..', 'seeds')
    }
  });
  return knexInstance;
}

async function migrateLatest() {
  const knex = getKnex();
  await knex.migrate.latest();
}

async function rollbackAll() {
  const knex = getKnex();
  // rollback until no more migrations
  // knex.migrate.rollback returns [batchNo, log]
  // loop up to a safe maximum to avoid infinite loops
  for (let i = 0; i < 50; i++) {
    const result = await knex.migrate.rollback(undefined, true);
    if (!result || result[1].length === 0) break;
  }
}

async function seedRun() {
  const knex = getKnex();
  await knex.seed.run();
}

async function destroy() {
  if (knexInstance) {
    await knexInstance.destroy();
    knexInstance = null;
  }
}

module.exports = {
  getKnex,
  migrateLatest,
  rollbackAll,
  seedRun,
  destroy
};
