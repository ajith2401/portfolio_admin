'use strict';

import DOMPurify from 'isomorphic-dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Configure DOMPurify
const purifyConfig = {
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
  ALLOW_DATA_ATTR: false,
  ADD_TAGS: ['iframe'], // Allow embedded content
  ADD_ATTR: ['allowfullscreen', 'frameborder', 'src'] // For iframes
};

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return purify.sanitize(input, purifyConfig);
}

export function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      
      if (typeof value === 'string') {
        sanitized[key] = sanitizeInput(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

export function sanitizeMiddleware(req) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  return req;
}
