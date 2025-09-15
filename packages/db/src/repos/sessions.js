const crypto = require('crypto');

async function createSession(knex, userId, refreshTokenHash, expiresAt, metadata = null) {
    const id = 's_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();
    const sessionData = {
        id,
        user_id: userId,
        refresh_token_hash: refreshTokenHash,
        expires_at: expiresAt,
        created_at: now
    };

    if (metadata) {
        sessionData.metadata = JSON.stringify(metadata);
    }

    await knex('sessions').insert(sessionData);
    return knex('sessions').where({ id }).first();
}

function findSession(knex, refreshTokenHash) {
    return knex('sessions').where({ refresh_token_hash: refreshTokenHash }).first();
}

function deleteSession(knex, id) {
    return knex('sessions').where({ id }).del();
}

module.exports = { createSession, findSession, deleteSession };
