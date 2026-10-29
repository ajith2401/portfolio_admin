// src/app/api/login/route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { User } from '@/models';
import connectDB from '@/lib/mongodb';
import { signToken, createSessionCookie } from '@/lib/auth';
import { applyRateLimit, globalRateLimiter, getClientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  // 1. Rate limiting on login: max 5 requests per 15 minutes per IP
  const rateLimitResult = applyRateLimit(req, 'login', 5, 15 * 60 * 1000);
  if (!rateLimitResult.allowed) {
    return rateLimitResult.response;
  }

  await connectDB();

  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.email || !body.password) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 400 }
      );
    }

    const { email, password } = body;
    const normalizedEmail = String(email).trim().toLowerCase();

    // Find the user by normalized email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Use generic error message to prevent user enumeration
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { message: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Reset rate limiter on successful authentication
    const ip = getClientIp(req);
    globalRateLimiter.reset(`login:${ip}`);

    // Update lastLogin timestamp
    user.lastLogin = new Date();
    await user.save();

    // Create JWT payload
    const payload = {
      userId: user._id.toString(),
      role: user.role,
      email: user.email
    };

    const token = await signToken(payload, '1h');
    const cookie = createSessionCookie(token, 60 * 60);

    const res = NextResponse.json({
      message: 'Login successful',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    res.headers.set('Set-Cookie', cookie);
    return res;
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json(
      { message: 'An unexpected server error occurred' },
      { status: 500 }
    );
  }
}
