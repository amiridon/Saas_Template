async function listAllOrganizations(knex) {
    return knex('organizations')
        .select('id', 'slug', 'name', 'plan_tier')
        .orderBy('slug', 'asc');
}

module.exports = { listAllOrganizations };
