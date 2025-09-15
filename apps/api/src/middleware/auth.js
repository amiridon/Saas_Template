const { getKnex } = require('../../../../packages/db/src');
const { findSession } = require('../../../../packages/db/src/repos/sessions');
const { findUserById } = require('../../../../packages/db/src/repos/users');

/**
 * Authentication middleware that validates session and attaches user
 */
async function requireAuth(req, res, next) {
    try {
        const sessionId = req.cookies.sid;
        if (!sessionId) {
            return res.status(401).json({ error: 'authentication required' });
        }

        const knex = getKnex();
        const session = await findSession(knex, sessionId);

        if (!session || new Date(session.expires_at) < new Date()) {
            return res.status(401).json({ error: 'invalid or expired session' });
        }

        const user = await findUserById(knex, session.user_id);
        if (!user) {
            return res.status(401).json({ error: 'user not found' });
        }

        req.user = user;
        req.sessionId = sessionId;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'authentication error' });
    }
}

/**
 * Optional authentication middleware - attaches user if session exists
 */
async function optionalAuth(req, res, next) {
    try {
        const sessionId = req.cookies.sid;
        if (!sessionId) {
            return next();
        }

        const knex = getKnex();
        const session = await findSession(knex, sessionId);

        if (session && new Date(session.expires_at) >= new Date()) {
            const user = await findUserById(knex, session.user_id);
            if (user) {
                req.user = user;
                req.sessionId = sessionId;
            }
        }

        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        next(); // Continue without auth on error
    }
}

/**
 * Organization context middleware - extracts and validates org context
 */
async function requireOrg(req, res, next) {
    try {
        const orgId = req.headers['x-org-id'] || req.params.orgId || req.body.orgId;

        if (!orgId) {
            return res.status(400).json({ error: 'organization context required' });
        }

        const knex = getKnex();
        const org = await knex('organizations').where({ id: orgId }).first();

        if (!org) {
            return res.status(404).json({ error: 'organization not found' });
        }

        req.orgId = orgId;
        req.org = org;
        next();
    } catch (error) {
        console.error('Org middleware error:', error);
        res.status(500).json({ error: 'organization validation error' });
    }
}

/**
 * Role-based access control middleware
 */
function requireRole(allowedRoles) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'authentication required' });
            }

            if (!req.orgId) {
                return res.status(400).json({ error: 'organization context required' });
            }

            const knex = getKnex();
            const membership = await knex('memberships')
                .where({
                    user_id: req.user.id,
                    organization_id: req.orgId
                })
                .first();

            if (!membership) {
                return res.status(403).json({ error: 'not a member of this organization' });
            }

            if (!allowedRoles.includes(membership.role)) {
                return res.status(403).json({
                    error: 'insufficient permissions',
                    required: allowedRoles,
                    current: membership.role
                });
            }

            req.membership = membership;
            next();
        } catch (error) {
            console.error('Role middleware error:', error);
            res.status(500).json({ error: 'permission validation error' });
        }
    };
}

/**
 * Permission-based access control middleware
 */
function requirePermission(permission) {
    const rolePermissions = {
        owner: ['*'], // Owner can do everything
        admin: [
            'users.read', 'users.create', 'users.update', 'users.delete',
            'billing.read', 'billing.update',
            'settings.read', 'settings.update',
            'analytics.read'
        ],
        member: [
            'users.read',
            'settings.read'
        ],
        viewer: [
            'users.read'
        ]
    };

    return async (req, res, next) => {
        try {
            if (!req.membership) {
                return res.status(403).json({ error: 'membership required' });
            }

            const userPermissions = rolePermissions[req.membership.role] || [];

            // Check for wildcard permission (owner)
            if (userPermissions.includes('*')) {
                return next();
            }

            // Check for specific permission
            if (!userPermissions.includes(permission)) {
                return res.status(403).json({
                    error: 'insufficient permissions',
                    required: permission,
                    available: userPermissions
                });
            }

            next();
        } catch (error) {
            console.error('Permission middleware error:', error);
            res.status(500).json({ error: 'permission validation error' });
        }
    };
}

/**
 * Check if user owns a resource or has sufficient role
 */
function requireOwnershipOrRole(allowedRoles = ['admin', 'owner']) {
    return async (req, res, next) => {
        try {
            const targetUserId = req.params.userId || req.body.userId;

            // User can always access their own resources
            if (req.user.id === targetUserId) {
                return next();
            }

            // Otherwise, check role permissions
            return requireRole(allowedRoles)(req, res, next);
        } catch (error) {
            console.error('Ownership middleware error:', error);
            res.status(500).json({ error: 'ownership validation error' });
        }
    };
}

module.exports = {
    requireAuth,
    optionalAuth,
    requireOrg,
    requireRole,
    requirePermission,
    requireOwnershipOrRole
};