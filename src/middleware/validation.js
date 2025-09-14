'use strict';

import { NextResponse } from 'next/server';

export function validateWritingInput(req) {
  const errors = [];
  const body = req.body;

  if (!body.title?.trim()) {
    errors.push('Title is required');
  }
  if (!body.body?.trim()) {
    errors.push('Content is required');
  }
  if (!body.category || !['Poetry', 'Short Story', 'Essay', 'Novel', 'Article', 'Review', 'Personal'].includes(body.category)) {
    errors.push('Valid category is required');
  }

  return errors;
}

export function validatePagination(searchParams) {
  const page = parseInt(searchParams.get('page')) || 1;
  const limit = Math.min(parseInt(searchParams.get('limit')) || 12, 50);
  
  return {
    page: page > 0 ? page : 1,
    limit: limit > 0 ? limit : 12
  };
}

export function errorHandler(error) {
  console.error('API Error:', error);

  if (error.name === 'ValidationError') {
    return NextResponse.json({
      error: 'Validation Error',
      details: Object.values(error.errors).map(err => err.message)
    }, { status: 400 });
  }

  if (error.name === 'CastError') {
    return NextResponse.json({
      error: 'Invalid ID Format',
      details: error.message
    }, { status: 400 });
  }

  return NextResponse.json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
  }, { status: 500 });
}
