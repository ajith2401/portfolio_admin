// src/middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { ALLOWED_ORIGINS, getJwtSecretBytes } from '@/lib/auth';


export async function proxy(req) {
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
      await jwtVerify(tokenCookie.value, getJwtSecretBytes(), { algorithms: ['HS256'] });
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
