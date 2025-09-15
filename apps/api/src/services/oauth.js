const crypto = require('crypto');
const https = require('https');
const { URLSearchParams } = require('url');

class OAuthService {
    constructor() {
        this.providers = {
            google: {
                authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
                scope: 'openid email profile',
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET
            },
            microsoft: {
                authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
                scope: 'openid email profile',
                clientId: process.env.MICROSOFT_CLIENT_ID,
                clientSecret: process.env.MICROSOFT_CLIENT_SECRET
            }
        };
    }

    generateAuthUrl(provider, redirectUri) {
        const config = this.providers[provider];
        if (!config) {
            throw new Error(`Unsupported OAuth provider: ${provider}`);
        }

        if (!config.clientId) {
            throw new Error(`Missing client ID for ${provider}`);
        }

        const state = crypto.randomBytes(16).toString('hex');
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: config.scope,
            state: state
        });

        return {
            authUrl: `${config.authUrl}?${params.toString()}`,
            state: state
        };
    }

    async exchangeCodeForTokens(provider, code, redirectUri) {
        const config = this.providers[provider];
        if (!config) {
            throw new Error(`Unsupported OAuth provider: ${provider}`);
        }

        if (!config.clientId || !config.clientSecret) {
            throw new Error(`Missing OAuth credentials for ${provider}`);
        }

        const params = new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        });

        try {
            const tokenResponse = await this.makeHttpRequest('POST', config.tokenUrl, params.toString(), {
                'Content-Type': 'application/x-www-form-urlencoded'
            });

            const tokens = JSON.parse(tokenResponse);

            if (!tokens.access_token) {
                throw new Error('Failed to obtain access token');
            }

            return tokens;
        } catch (error) {
            throw new Error(`Token exchange failed: ${error.message}`);
        }
    }

    async getUserInfo(provider, accessToken) {
        const config = this.providers[provider];
        if (!config) {
            throw new Error(`Unsupported OAuth provider: ${provider}`);
        }

        try {
            const userResponse = await this.makeHttpRequest('GET', config.userInfoUrl, null, {
                'Authorization': `Bearer ${accessToken}`
            });

            const userData = JSON.parse(userResponse);

            // Normalize user data across providers
            let normalizedUser;
            if (provider === 'google') {
                normalizedUser = {
                    id: userData.id,
                    email: userData.email,
                    name: userData.name,
                    picture: userData.picture,
                    verified_email: userData.verified_email
                };
            } else if (provider === 'microsoft') {
                normalizedUser = {
                    id: userData.id,
                    email: userData.mail || userData.userPrincipalName,
                    name: userData.displayName,
                    picture: null, // Microsoft Graph requires separate API call
                    verified_email: true // Microsoft emails are always verified
                };
            }

            return normalizedUser;
        } catch (error) {
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    makeHttpRequest(method, url, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: headers
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(responseData);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data) {
                req.write(data);
            }

            req.end();
        });
    }

    async handleOAuthFlow(provider, code, redirectUri) {
        try {
            // Exchange authorization code for tokens
            const tokens = await this.exchangeCodeForTokens(provider, code, redirectUri);

            // Get user information
            const userInfo = await this.getUserInfo(provider, tokens.access_token);

            return {
                userInfo: userInfo,
                tokens: tokens
            };
        } catch (error) {
            throw new Error(`OAuth flow failed: ${error.message}`);
        }
    }
}

module.exports = OAuthService;