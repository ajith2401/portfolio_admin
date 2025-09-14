'use strict';

import { NextResponse } from 'next/server';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function cacheMiddleware(request, handler) {
  const cacheKey = request.url;
  
  // Only cache GET requests
  if (request.method !== 'GET') {
    return handler(request);
  }

  try {
    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    // Get fresh data
    const response = await handler(request);
    const data = await response.json();

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(data));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Cache Error:', error);
    return handler(request);
  }
}

export async function invalidateCache(patterns) {
  try {
    const keys = await redis.keys(patterns);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error('Cache Invalidation Error:', error);
  }
}
