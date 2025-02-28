// /app/api/login/route.js
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { serialize } from 'cookie';
import User from '@/models/user.model';
import connectDB from '@/lib/db';

export async function POST(req) {
  await connectDB();  // Ensure DB is connected

  try {
    // Parse the request body
    const { email, password } = await req.json();

    // Check if email and password are provided
    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    // Compare the provided password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return NextResponse.json({ message: 'Invalid email or password' }, { status: 401 });
    }

    // Create JWT payload
    const payload = {
      userId: user._id.toString(),
      role: user.role
    };

    // Convert secret to Uint8Array for jose
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    
    // Generate JWT token using jose
    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    // Create a cookie to store the JWT token
    const cookie = serialize('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure flag in production
      maxAge: 60 * 60,  // 1 hour
      path: '/',
    });

    // Set the cookie in the response headers
    const res = NextResponse.json({
      message: 'Login successful',
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    res.headers.set('Set-Cookie', cookie);

    return res;
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}