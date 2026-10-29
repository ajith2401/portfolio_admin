// src/lib/rateLimit.js

/**
 * In-memory sliding window rate limiter
 */
class RateLimiter {
  constructor() {
    this.hits = new Map();
    // Periodically clean up expired entries every 5 minutes
    if (typeof setInterval !== 'undefined') {
      const interval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
      if (interval.unref) interval.unref();
    }
  }

  /**
   * Check if a request exceeds rate limit
   * @param {string} key Unique identifier (IP, user id, etc.)
   * @param {number} limit Max requests allowed in window
   * @param {number} windowMs Time window in milliseconds
   * @returns {{ allowed: boolean, remaining: number, resetTime: number }}
   */
  check(key, limit, windowMs) {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      this.hits.set(key, record);
      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: record.resetTime
      };
    }

    if (record.count < limit) {
      record.count += 1;
      return {
        allowed: true,
        remaining: limit - record.count,
        resetTime: record.resetTime
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }

  /**
   * Reset hits for a given key (e.g. after successful login)
   * @param {string} key 
   */
  reset(key) {
    this.hits.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.hits.entries()) {
      if (now > record.resetTime) {
        this.hits.delete(key);
      }
    }
  }
}

// Global rate limiter instance
const globalRateLimiter = new RateLimiter();

/**
 * Extracts client IP from request headers or socket
 * @param {Request} request 
 * @returns {string}
 */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

/**
 * Apply rate limiting to an API request
 * @param {Request} request 
 * @param {string} actionName Prefix for rate limit key
 * @param {number} limit Max allowed calls
 * @param {number} windowMs Window duration in ms
 * @returns {{ allowed: boolean, response: Response|null }}
 */
export function applyRateLimit(request, actionName = 'general', limit = 60, windowMs = 60 * 1000) {
  const ip = getClientIp(request);
  const key = `${actionName}:${ip}`;
  const result = globalRateLimiter.check(key, limit, windowMs);

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.resetTime - Date.now()) / 1000);
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({
          error: 'Too many requests. Please try again later.',
          retryAfter: retryAfterSeconds
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000))
          }
        }
      )
    };
  }

  return {
    allowed: true,
    response: null
  };
}

export { globalRateLimiter };

