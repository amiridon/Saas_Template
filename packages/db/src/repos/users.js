const crypto = require('crypto');

async function createUser(knex, userData) {
    const id = 'u_' + crypto.randomBytes(6).toString('hex');
    const now = new Date().toISOString();

    const userRecord = {
        id,
        email: userData.email,
        password_hash: userData.passwordHash || userData.password_hash,
        name: userData.name,
        created_at: now,
        updated_at: now
    };

    // Add optional fields if provided
    if (userData.email_verified !== undefined) {
        userRecord.email_verified = userData.email_verified;
    }
    if (userData.oauth_provider) {
        userRecord.oauth_provider = userData.oauth_provider;
    }
    if (userData.oauth_provider_id) {
        userRecord.oauth_provider_id = userData.oauth_provider_id;
    }
    if (userData.image_url) {
        userRecord.image_url = userData.image_url;
    }

    await knex('users').insert(userRecord);
    return findUserById(knex, id);
}

function findUserByEmail(knex, email) {
    return knex('users').where({ email }).first();
}

function findUserById(knex, id) {
    return knex('users').where({ id }).first();
}

async function markEmailVerified(knex, userId) {
    await knex('users').where({ id: userId }).update({ email_verified_at: new Date().toISOString() });
}

module.exports = { createUser, findUserByEmail, findUserById, markEmailVerified };
