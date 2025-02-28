// middleware.js
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export async function middleware(req) {
  const { cookies } = req;
  const tokenCookie = cookies.get('token');

  if (!tokenCookie) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  
  const token = tokenCookie.value;
  
  try {
    // Convert your JWT_SECRET to Uint8Array
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    
    // Verify the JWT token
    const { payload } = await jwtVerify(token, secret);
    console.log("Decoded token:", payload);
    
    // Continue with the valid token
    return NextResponse.next();
  } catch (err) {
    console.log("Token verification failed:", err.message);
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
  ],
};