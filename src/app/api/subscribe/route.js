// src/app/api/subscribe/route.js
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import connectDB from '@/lib/mongodb';
import { Subscriber } from '@/models';
import { validateEmail, sendVerificationEmail, sendWelcomeEmail } from '@/lib/emailUtils';
import { applyRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function POST(request) {
  const rateLimit = applyRateLimit(request, 'subscribe', 5, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();
    
    const body = await request.json().catch(() => null);
    if (!body || !body.email || typeof body.email !== 'string') {
      return NextResponse.json(
        { message: 'Valid email is required' },
        { status: 400 }
      );
    }

    const { email, preferences } = body;
    const normalizedEmail = email.trim().toLowerCase();
    
    const isValidEmail = await validateEmail(normalizedEmail);
    if (!isValidEmail) {
      return NextResponse.json(
        { message: 'Please provide a valid email address' },
        { status: 400 }
      );
    }
    
    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json(
        { message: 'Preferences are required' }, 
        { status: 400 }
      );
    }
    
    if (!preferences.blog && !preferences.quill) {
      return NextResponse.json(
        { message: 'At least one subscription preference must be selected' },
        { status: 400 }
      );
    }
    
    // Generate cryptographically secure token
    const verificationToken = generateSecureToken();
    
    let subscriber = await Subscriber.findOne({ email: normalizedEmail });
    
    if (subscriber) {
      subscriber.preferences = {
        blog: Boolean(preferences.blog),
        quill: Boolean(preferences.quill)
      };
      subscriber.active = true;
      
      if (!subscriber.isVerified) {
        subscriber.verificationToken = verificationToken;
      }
      
      await subscriber.save();
    } else {
      subscriber = await Subscriber.create({
        email: normalizedEmail,
        preferences: {
          blog: Boolean(preferences.blog),
          quill: Boolean(preferences.quill)
        },
        verificationToken,
        isVerified: false,
        active: true
      });
    }
    
    if (!subscriber.isVerified) {
      await sendVerificationEmail(normalizedEmail, verificationToken, subscriber.preferences);
    }
    
    return NextResponse.json({
      message: 'Subscription successful!',
      isVerified: subscriber.isVerified,
      needsVerification: !subscriber.isVerified
    });
  } catch (error) {
    console.error('Subscription error:', error);
    
    if (error.code === 11000) {
      return NextResponse.json(
        { message: 'You are already subscribed with this email address' },
        { status: 409 }
      );
    }
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { message: errors.join(', ') },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: 'Failed to process subscription' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const action = searchParams.get('action') || 'verify';
    
    if (!token || typeof token !== 'string' || token.length < 16) {
      return NextResponse.json(
        { message: 'Valid token is required' },
        { status: 400 }
      );
    }
    
    if (action === 'verify') {
      const subscriber = await Subscriber.findOne({ verificationToken: token });
      
      if (!subscriber) {
        return NextResponse.json(
          { message: 'Invalid or expired verification token' },
          { status: 400 }
        );
      }
      
      subscriber.isVerified = true;
      subscriber.verificationToken = null;
      await subscriber.save();
      
      try {
        await sendWelcomeEmail(
          subscriber.email, 
          subscriber.preferences, 
          subscriber.unsubscribeToken
        );
      } catch (error) {
        console.error('Error sending welcome email:', error);
      }
      
      return NextResponse.redirect(new URL('/subscription-verified', request.url));
    } else if (action === 'unsubscribe') {
      const subscriber = await Subscriber.findOne({ unsubscribeToken: token });
      
      if (!subscriber) {
        return NextResponse.json(
          { message: 'Invalid unsubscribe token' },
          { status: 400 }
        );
      }
      
      subscriber.active = false;
      await subscriber.save();
      
      return NextResponse.redirect(new URL('/unsubscribed', request.url));
    }
    
    return NextResponse.json(
      { message: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Token verification error:', error);
    return NextResponse.json(
      { message: 'Failed to process request' },
      { status: 500 }
    );
  }
}
