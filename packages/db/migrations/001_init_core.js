/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
  // users
  await knex.schema.createTable('users', (t) => {
    t.string('id').primary();
    t.string('email').notNullable().unique();
    t.string('password_hash');
    t.string('name');
    t.string('image_url');
    t.string('two_factor_secret');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at');
  });

  // organizations
  await knex.schema.createTable('organizations', (t) => {
    t.string('id').primary();
    t.string('slug').notNullable().unique();
    t.string('name').notNullable();
    t.string('owner_user_id').notNullable().references('id').inTable('users');
    t.string('plan_tier').notNullable().defaultTo('free');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at');
  });

  // memberships (tenant scoped)
  await knex.schema.createTable('memberships', (t) => {
    t.string('id').primary();
    t.string('org_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    t.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('role').notNullable();
    t.string('status').notNullable().defaultTo('active');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('deleted_at');
    t.unique(['org_id', 'user_id']);
    t.index(['org_id']);
    t.index(['user_id']);
  });

  // sessions
  await knex.schema.createTable('sessions', (t) => {
    t.string('id').primary();
    t.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('refresh_token_hash').notNullable();
    t.timestamp('expires_at').notNullable();
    t.string('ip');
    t.string('ua');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id']);
    t.index(['expires_at']);
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('memberships');
  await knex.schema.dropTableIfExists('organizations');
  await knex.schema.dropTableIfExists('users');
};