/** @param {import('knex').Knex} knex */
exports.seed = async (knex) => {
  // Clear tables in dependency order
  await knex('sessions').del();
  await knex('memberships').del();
  await knex('organizations').del();
  await knex('users').del();

  const now = new Date().toISOString();

  const users = [
    { id: 'u_admin', email: 'admin@example.com', password_hash: 'x', name: 'Admin User', created_at: now, updated_at: now },
    { id: 'u_alice', email: 'alice@example.com', password_hash: 'x', name: 'Alice', created_at: now, updated_at: now },
    { id: 'u_bob', email: 'bob@example.com', password_hash: 'x', name: 'Bob', created_at: now, updated_at: now },
  ];

  await knex('users').insert(users);

  const orgs = [
    { id: 'o_alpha', slug: 'alpha', name: 'Alpha Org', owner_user_id: 'u_admin', plan_tier: 'free', created_at: now, updated_at: now },
    { id: 'o_beta', slug: 'beta', name: 'Beta Org', owner_user_id: 'u_admin', plan_tier: 'pro', created_at: now, updated_at: now },
  ];

  await knex('organizations').insert(orgs);

  const memberships = [
    { id: 'm_admin_alpha', org_id: 'o_alpha', user_id: 'u_admin', role: 'owner', status: 'active', created_at: now, updated_at: now },
    { id: 'm_alice_alpha', org_id: 'o_alpha', user_id: 'u_alice', role: 'member', status: 'active', created_at: now, updated_at: now },
    { id: 'm_bob_beta', org_id: 'o_beta', user_id: 'u_bob', role: 'member', status: 'active', created_at: now, updated_at: now },
  ];

  await knex('memberships').insert(memberships);
};