const path = require('path');
const { getConfig } = require('../core/config');

const cfg = getConfig();

module.exports = {
  client: cfg.DB_PROVIDER === 'sqlite' ? 'better-sqlite3' : cfg.DB_PROVIDER,
  connection:
    cfg.DB_PROVIDER === 'sqlite'
      ? { filename: path.resolve(process.cwd(), cfg.DB_URL) }
      : cfg.DB_URL,
  useNullAsDefault: cfg.DB_PROVIDER === 'sqlite',
  migrations: {
    tableName: 'knex_migrations',
    directory: path.join(__dirname, 'migrations')
  },
  seeds: {
    directory: path.join(__dirname, 'seeds')
  }
};