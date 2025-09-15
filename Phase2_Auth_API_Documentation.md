# Phase 2 Authentication API Documentation

## Overview

This document covers all authentication and authorization features implemented in Phase 2 of the SaaS Template, including:

- Role-Based Access Control (RBAC)
- Two-Factor Authentication (2FA)
- OAuth Integration (Google, Microsoft)
- Magic Link Authentication
- Enhanced Session Tracking
- Organization Management

## Authentication Headers

All protected endpoints require a session cookie:

```
Cookie: sid=<session_id>
```

For organization-scoped endpoints, include:

```
x-org-id: <organization_id>
```

## Core Authentication Endpoints

### POST `/auth/signup`
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "User Name"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com"
  },
  "verifyToken": "verification_token"
}
```

### POST `/auth/verify`
Verify email address using the token from signup.

**Request:**
```json
{
  "userId": "user_id",
  "token": "verification_token"
}
```

### POST `/auth/login`
Authenticate user and create session.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Response:** Sets `sid` cookie and returns:
```json
{
  "ok": true
}
```

### POST `/auth/logout`
🔒 **Requires:** Authentication

Invalidate current session.

**Response:**
```json
{
  "ok": true
}
```

### GET `/me`
🔒 **Requires:** Authentication

Get current user information.

**Response:**
```json
{
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "email_verified": true
  }
}
```

## Two-Factor Authentication (2FA)

### POST `/auth/2fa/setup`
🔒 **Requires:** Authentication

Generate TOTP secret and QR code for 2FA setup.

**Response:**
```json
{
  "secret": "base32_secret",
  "qrCode": "data:image/png;base64,...",
  "manualEntryKey": "base32_secret"
}
```

### POST `/auth/2fa/verify`
🔒 **Requires:** Authentication

Verify TOTP token and enable 2FA.

**Request:**
```json
{
  "token": "123456"
}
```

**Response:**
```json
{
  "ok": true,
  "backupCodes": ["ABCD1234", "EFGH5678", ...]
}
```

### POST `/auth/2fa/disable`
🔒 **Requires:** Authentication

Disable 2FA for the user.

**Request:**
```json
{
  "password": "current_password"
}
```

**Response:**
```json
{
  "ok": true
}
```

## OAuth Authentication

### GET `/auth/oauth/:provider`
**Providers:** `google`, `microsoft`

Redirect to OAuth provider for authentication.

**Response:** HTTP 302 redirect to OAuth provider

### GET `/auth/oauth/:provider/callback`
**Providers:** `google`, `microsoft`

OAuth callback endpoint. Handles the authorization code exchange.

**Query Parameters:**
- `code`: Authorization code from OAuth provider
- `state`: CSRF protection state parameter

**Response:** HTTP 302 redirect to frontend with session cookie set

## Magic Link Authentication

### POST `/auth/magic-link`
Send passwordless login link via email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Magic link sent to your email",
  "magicLink": "https://app.example.com/auth/magic-link/verify?token=..."
}
```

### GET `/auth/magic-link/verify`
Verify magic link and create session.

**Query Parameters:**
- `token`: Magic link token
- `userId`: User ID

**Response:**
```json
{
  "ok": true,
  "message": "Successfully logged in via magic link"
}
```

## Password Reset

### POST `/auth/forgot`
Request password reset token.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "resetToken": "reset_token"
}
```

### POST `/auth/reset`
Reset password using token.

**Request:**
```json
{
  "userId": "user_id",
  "token": "reset_token",
  "newPassword": "new_password"
}
```

**Response:**
```json
{
  "ok": true
}
```

## Organization Management

### GET `/orgs`
🔒 **Requires:** Authentication

List organizations user is a member of.

**Response:**
```json
{
  "organizations": [
    {
      "id": "org_id",
      "name": "Organization Name",
      "slug": "org-slug",
      "role": "owner"
    }
  ]
}
```

### GET `/orgs/:orgId/members`
🔒 **Requires:** Authentication, Organization Context, Role: `admin` or `owner`

List organization members.

**Headers:**
```
x-org-id: org_id
```

**Response:**
```json
{
  "members": [
    {
      "id": "user_id",
      "email": "user@example.com",
      "name": "User Name",
      "role": "member",
      "created_at": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

### POST `/orgs/:orgId/members`
🔒 **Requires:** Authentication, Organization Context, Role: `owner`

Add new member to organization.

**Headers:**
```
x-org-id: org_id
```

**Request:**
```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```

**Response:**
```json
{
  "ok": true,
  "member": {
    "id": "user_id",
    "email": "newmember@example.com",
    "role": "member"
  }
}
```

## Middleware Documentation

### requireAuth
Validates session and attaches user to request.

**Usage:**
```javascript
app.get('/protected', requireAuth, (req, res) => {
  // req.user is available
});
```

### optionalAuth
Attaches user if session exists, continues without user if no session.

**Usage:**
```javascript
app.get('/public', optionalAuth, (req, res) => {
  // req.user may or may not be available
});
```

### requireOrg
Validates organization context from headers or parameters.

**Usage:**
```javascript
app.get('/orgs/:orgId/data', requireAuth, requireOrg, (req, res) => {
  // req.orgId and req.org are available
});
```

### requireRole(allowedRoles)
Checks user has one of the specified roles in the current organization.

**Roles:** `owner`, `admin`, `member`, `viewer`

**Usage:**
```javascript
app.delete('/orgs/:orgId/data', 
  requireAuth, 
  requireOrg, 
  requireRole(['owner', 'admin']), 
  handler
);
```

### requirePermission(permission)
Checks user has specific permission in the current organization.

**Permissions:**
- `users.read`, `users.create`, `users.update`, `users.delete`
- `billing.read`, `billing.update`
- `settings.read`, `settings.update`
- `analytics.read`

**Usage:**
```javascript
app.get('/orgs/:orgId/analytics', 
  requireAuth, 
  requireOrg, 
  requirePermission('analytics.read'), 
  handler
);
```

### requireOwnershipOrRole(allowedRoles)
Allows access if user owns the resource OR has sufficient role.

**Usage:**
```javascript
app.get('/users/:userId/profile', 
  requireAuth, 
  requireOwnershipOrRole(['admin', 'owner']), 
  handler
);
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "email and password required"
}
```

### 401 Unauthorized
```json
{
  "error": "authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "insufficient permissions",
  "required": ["admin", "owner"],
  "current": "member"
}
```

### 404 Not Found
```json
{
  "error": "organization not found"
}
```

### 409 Conflict
```json
{
  "error": "email in use"
}
```

### 500 Internal Server Error
```json
{
  "error": "authentication error"
}
```

## Security Features

### Session Security
- Sessions include IP address and User-Agent tracking
- Secure cookies in production (`secure: true`)
- httpOnly cookies prevent XSS attacks
- sameSite protection against CSRF

### OAuth Security
- State parameter for CSRF protection
- Secure token exchange
- User info validation
- Automatic account linking

### 2FA Security
- TOTP-based authentication
- Backup codes for recovery
- Base32 encoded secrets
- Time-based token validation with window tolerance

### Magic Link Security
- Short expiration time (15 minutes)
- Single-use tokens
- Cryptographically secure token generation
- Token hash storage

## Environment Variables

### OAuth Configuration
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
```

### Application URLs
```bash
API_URL=http://localhost:3001
APP_URL=http://localhost:3000
```

## Database Schema Changes

### Users Table Additions
```sql
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN backup_codes TEXT; -- JSON array
ALTER TABLE users ADD COLUMN oauth_provider TEXT;
ALTER TABLE users ADD COLUMN oauth_provider_id TEXT;
```

### Sessions Table Additions
```sql
ALTER TABLE sessions ADD COLUMN metadata TEXT; -- JSON object
```

### Fixed Memberships Table
```sql
-- Changed org_id to organization_id for consistency
ALTER TABLE memberships RENAME COLUMN org_id TO organization_id;
```

This completes the Phase 2 authentication implementation with comprehensive security features, proper RBAC, and modern authentication flows.