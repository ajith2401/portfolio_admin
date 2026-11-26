import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const src = fs.readFileSync(path.join(root, 'src/app/api/projects/[id]/comments/route.js'), 'utf8');

describe('project comments POST', () => {
  it('validates the id and only accepts published projects', () => {
    assert.match(src, /\[0-9a-f\]\{24\}/i);
    assert.match(src, /project\.status !== 'published'/);
    // the guard must run before the comment is created
    assert.ok(src.indexOf("project.status !== 'published'") < src.indexOf('Comment.create'));
  });
});
