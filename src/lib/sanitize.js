// src/lib/sanitize.js
import DOMPurify from 'isomorphic-dompurify';

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
    'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'span', 'del'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'class', 'id', 'src', 'alt', 'title', 'width', 'height'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
};

// Add hook to ensure external links have secure rel attributes
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('rel', 'noopener noreferrer');
    if (!node.hasAttribute('target')) {
      node.setAttribute('target', '_blank');
    }
  }
});

/**
 * Sanitize untrusted HTML or text content
 * Preserves Tamil script, whitespace, and formatting while stripping malicious payloads.
 * @param {string} input 
 * @returns {string}
 */
export function sanitizeHtml(input) {
  if (typeof input !== 'string') return input;
  return DOMPurify.sanitize(input, SANITIZE_CONFIG);
}

/**
 * Recursively sanitize strings inside an object or array
 * @param {any} data 
 * @returns {any}
 */
export function sanitizeData(data) {
  if (typeof data === 'string') {
    return sanitizeHtml(data);
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }
  if (data !== null && typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeData(value);
    }
    return sanitized;
  }
  return data;
}
