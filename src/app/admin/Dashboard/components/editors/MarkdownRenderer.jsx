// src/app/admin/Dashboard/components/editors/MarkdownRenderer.jsx
'use client';

import React, { useMemo } from 'react';
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
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
};

export const sanitizeAndRenderMarkdown = (rawContent) => {
  if (!rawContent || typeof rawContent !== 'string') return '';

  // Safe basic markdown parsing
  let html = rawContent
    .replace(/# (.*$)/gm, '<h1>$1</h1>')
    .replace(/## (.*$)/gm, '<h2>$1</h2>')
    .replace(/### (.*$)/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/~~(.*?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded">')
    .replace(/^\> (.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/^\- (.*$)/gm, '<ul><li>$1</li></ul>')
    .replace(/^(\d+)\. (.*$)/gm, '<ol><li>$2</li></ol>')
    .replace(/^---$/gm, '<hr>')
    .replace(/\n/g, '<br>');

  html = html.replace(/<\/ul><ul>/g, '').replace(/<\/ol><ol>/g, '');

  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
};

export const MarkdownRenderer = ({ content, className = '' }) => {
  const sanitizedHtml = useMemo(() => sanitizeAndRenderMarkdown(content), [content]);

  return (
    <div
      className={`prose max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
};

export default MarkdownRenderer;
