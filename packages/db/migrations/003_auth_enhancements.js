/** @param {import('knex').Knex} knex */
exports.up = async (knex) => {
    // Add 2FA and OAuth fields to users table
    await knex.schema.alterTable('users', (t) => {
        t.boolean('email_verified').defaultTo(false);
        t.string('totp_secret');
        t.boolean('totp_enabled').defaultTo(false);
        t.text('backup_codes'); // JSON array of backup codes
        t.string('oauth_provider'); // 'google', 'microsoft', etc.
        t.string('oauth_provider_id'); // OAuth provider's user ID
    });

    // Add metadata field to sessions for IP/UA tracking
    await knex.schema.alterTable('sessions', (t) => {
        t.text('metadata'); // JSON object with IP, UA, etc.
    });
};

/** @param {import('knex').Knex} knex */
exports.down = async (knex) => {
    await knex.schema.alterTable('users', (t) => {
        t.dropColumn('email_verified');
        t.dropColumn('totp_secret');
        t.dropColumn('totp_enabled');
        t.dropColumn('backup_codes');
        t.dropColumn('oauth_provider');
        t.dropColumn('oauth_provider_id');
    });

    await knex.schema.alterTable('sessions', (t) => {
        t.dropColumn('metadata');
    });
};