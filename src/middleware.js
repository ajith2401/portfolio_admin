// src/middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const ALLOWED_ORIGINS = [
  'https://admin.ajithkumar.com',
  'https://ajithkumar.com',
  'https://www.ajithkumarr.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

export async function middleware(req) {
  const origin = req.headers.get('origin');
  const isAllowedOrigin = origin && ALLOWED_ORIGINS.includes(origin);

  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    if (isAllowedOrigin) {
      res.headers.set('Access-Control-Allow-Origin', origin);
      res.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.headers.set('Access-Control-Max-Age', '86400');
    return res;
  }

  const { pathname } = req.nextUrl;

  // 2. Protect Admin Web UI Routes
  const isAdminRoute = pathname.startsWith('/admin') ||
                       pathname.startsWith('/create-writing') ||
                       pathname.startsWith('/studio');

  if (isAdminRoute) {
    const tokenCookie = req.cookies.get('token');
    if (!tokenCookie) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    try {
      const secret = new TextEncoder().encode(
        process.env.JWT_SECRET || 'dev-insecure-jwt-secret-replace-in-production'
      );
      await jwtVerify(tokenCookie.value, secret);
    } catch (err) {
      console.warn('Admin page access token verification failed:', err.message);
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  // 3. Forward request with CORS headers if matching allowed origins
  const response = NextResponse.next();
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/create-writing/:path*',
    '/studio/:path*',
    '/api/:path*',
  ],
};
