/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
    await knex.schema.alterTable('users', (t) => {
        t.timestamp('email_verified_at');
        t.string('reset_password_token_hash');
        t.timestamp('reset_password_expires_at');
    });

    await knex.schema.createTable('email_tokens', (t) => {
        t.string('id').primary();
        t.string('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        t.string('purpose').notNullable(); // 'verify' | 'reset'
        t.string('token_hash').notNullable();
        t.timestamp('expires_at').notNullable();
        t.timestamp('used_at');
        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.index(['user_id']);
        t.index(['purpose']);
        t.index(['expires_at']);
    });
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
    // Safe rollback: drop auxiliary table only. Keep added columns to avoid
    // SQLite table rebuild that can conflict with existing FKs in other tables.
    await knex.schema.dropTableIfExists('email_tokens');
};