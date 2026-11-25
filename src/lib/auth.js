// src/lib/auth.js
import { jwtVerify, SignJWT } from 'jose';
import { parse, serialize } from 'cookie';

const DEV_FALLBACK_SECRET = 'dev-insecure-jwt-secret-replace-in-production';

/**
 * Resolved lazily so that `next build` can import this module. In production a missing or
 * placeholder JWT_SECRET is a hard failure (fail closed): nobody can forge a session with the
 * well-known development fallback.
 */
export function getJwtSecretBytes(env = process.env) {
  const secret = env.JWT_SECRET;
  const production = env.NODE_ENV === 'production';
  if (!secret || secret === DEV_FALLBACK_SECRET) {
    if (production) throw new Error('JWT_SECRET is not configured');
    return new TextEncoder().encode(DEV_FALLBACK_SECRET);
  }
  return new TextEncoder().encode(secret);
}
const COOKIE_NAME = 'token';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Allowed origins for CORS and CSRF checks
export const ALLOWED_ORIGINS = [
  'https://admin.ajithkumarr.com',
  'https://ajithkumarr.com',
  'https://www.ajithkumarr.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

// Extra origins (for example a local admin port) come from the environment, never from the request.
for (const extra of String(process.env.ADMIN_ALLOWED_ORIGINS || '').split(',')) {
  const o = extra.trim();
  if (/^https?:\/\/[^/\s]+$/.test(o) && !ALLOWED_ORIGINS.includes(o)) ALLOWED_ORIGINS.push(o);
}

/**
 * Extracts and verifies JWT from Request cookies or Authorization header
 * @param {Request} request 
 * @returns {Promise<{ valid: boolean, user: Object|null, error: string|null }>}
 */
export async function getAuthenticatedUser(request) {
  try {
    let token = null;

    // 1. Try cookie
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      const cookies = parse(cookieHeader);
      token = cookies[COOKIE_NAME];
    }

    // 2. Try Authorization: Bearer <token>
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
    }

    if (!token) {
      return { valid: false, user: null, error: 'No authentication token provided' };
    }

    const { payload } = await jwtVerify(token, getJwtSecretBytes(), { algorithms: ['HS256'] });
    return {
      valid: true,
      user: {
        userId: payload.userId,
        role: payload.role,
        email: payload.email
      },
      error: null
    };
  } catch (err) {
    return { valid: false, user: null, error: err.message || 'Invalid or expired token' };
  }
}

/**
 * Authorization guard for API routes
 * @param {Request} request 
 * @param {string[]} allowedRoles 
 * @returns {Promise<{ authorized: boolean, user: Object|null, response: Response|null }>}
 */
export async function requireAuth(request, allowedRoles = ['admin', 'editor']) {
  const { valid, user, error } = await getAuthenticatedUser(request);

  if (!valid || !user) {
    return {
      authorized: false,
      user: null,
      response: new Response(
        JSON.stringify({ error: 'Unauthorized: Authentication required', details: error }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      authorized: false,
      user,
      response: new Response(
        JSON.stringify({ error: 'Forbidden: Insufficient privileges' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    };
  }

  return { authorized: true, user, response: null };
}

/**
 * Validates request Origin/Referer against allowed origins for mutating requests
 * @param {Request} request 
 * @returns {boolean}
 */
export function validateOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin) {
    return ALLOWED_ORIGINS.includes(origin);
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return ALLOWED_ORIGINS.includes(refererOrigin);
    } catch {
      return false;
    }
  }

  // Neither Origin nor Referer: acceptable for token-based CLI calls, but a request that carries the
  // session cookie must prove where it came from (CSRF defence in depth).
  const cookieHeader = request.headers.get('cookie') || '';
  return !/(?:^|;\s*)token=/.test(cookieHeader);
}

/**
 * Creates secure session cookie string
 * @param {string} token 
 * @param {number} maxAgeSeconds 
 * @returns {string}
 */
export function createSessionCookie(token, maxAgeSeconds = 3600) {
  return serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: maxAgeSeconds,
    path: '/'
  });
}

/**
 * Creates cookie deletion string for logout
 * @returns {string}
 */
export function clearSessionCookie() {
  return serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  });
}

/**
 * Signs a new JWT token
 * @param {Object} payload 
 * @param {string} expiresIn 
 * @returns {Promise<string>}
 */
export async function signToken(payload, expiresIn = '1h') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJwtSecretBytes());
}

