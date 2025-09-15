const crypto = require('crypto');

async function createEmailToken(knex, userId, purpose, tokenHash, expiresAt) {
    const id = 't_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();
    await knex('email_tokens').insert({ id, user_id: userId, purpose, token_hash: tokenHash, expires_at: expiresAt, created_at: now });
    return knex('email_tokens').where({ id }).first();
}

function findValidEmailToken(knex, userId, purpose, tokenHash) {
    return knex('email_tokens')
        .where({ user_id: userId, purpose, token_hash: tokenHash })
        .where('expires_at', '>', new Date().toISOString())
        .whereNull('used_at')
        .first();
}

async function markTokenUsed(knex, id) {
    await knex('email_tokens').where({ id }).update({ used_at: new Date().toISOString() });
}

module.exports = { createEmailToken, findValidEmailToken, markTokenUsed };
