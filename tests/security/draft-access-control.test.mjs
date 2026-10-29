import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the query filtering logic used in /api/writings, /api/projects, /api/tech-blog
function resolveStatusFilter(isAuthenticatedAdmin, requestedStatus) {
  if (!isAuthenticatedAdmin) {
    return 'published';
  }
  return requestedStatus || undefined;
}

// Test the comment sanitation & moderation enforcement logic
function createModeratedCommentPayload(rawBody, parentId, parentModel) {
  const allowedFields = ['name', 'email', 'comment', 'rating'];
  const sanitized = {};
  
  for (const field of allowedFields) {
    if (rawBody[field] !== undefined) {
      sanitized[field] = rawBody[field];
    }
  }

  // Strictly enforce moderation status and association
  sanitized.status = 'pending';
  sanitized.parentId = parentId;
  sanitized.parentModel = parentModel;

  return sanitized;
}

describe('Security: Draft Isolation & Comment Mass-Assignment Defense', () => {
  it('forces unauthenticated queries to status=published regardless of requested status', () => {
    const unauthWithDraft = resolveStatusFilter(false, 'draft');
    assert.equal(unauthWithDraft, 'published');

    const unauthWithAll = resolveStatusFilter(false, 'all');
    assert.equal(unauthWithAll, 'published');

    const unauthEmpty = resolveStatusFilter(false, null);
    assert.equal(unauthEmpty, 'published');
  });

  it('allows authenticated administrator to filter by draft or view all', () => {
    const adminDraft = resolveStatusFilter(true, 'draft');
    assert.equal(adminDraft, 'draft');

    const adminAll = resolveStatusFilter(true, null);
    assert.equal(adminAll, undefined); // Returns all documents
  });

  it('prevents mass assignment of comment status and forces pending moderation', () => {
    const maliciousPayload = {
      name: 'Tester',
      email: 'test@example.com',
      comment: 'Nice post',
      rating: 5,
      status: 'approved', // Attacker attempts to bypass moderation!
      isAdmin: true,
      __v: 99
    };

    const moderated = createModeratedCommentPayload(maliciousPayload, 'post-123', 'Writing');

    assert.equal(moderated.status, 'pending', 'Status MUST be forced to pending');
    assert.equal(moderated.isAdmin, undefined, 'Extra unapproved fields must not be assigned');
    assert.equal(moderated.__v, undefined);
    assert.equal(moderated.parentId, 'post-123');
    assert.equal(moderated.parentModel, 'Writing');
  });
});

