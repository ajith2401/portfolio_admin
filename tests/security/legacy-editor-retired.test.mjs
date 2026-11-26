import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => {
  const rel = path.join(d, e.name);
  return e.isDirectory() ? walk(rel) : [rel];
});

describe('retired Markdown writing editor (would hit HTTP 428 without version)', () => {
  it('old editor and form files are gone', () => {
    for (const f of ['src/app/admin/Dashboard/components/editors/WritingEditor.js', 'src/components/ui/form/WritingForm.js', 'src/components/ui/form/ContentForm.js']) {
      assert.equal(fs.existsSync(path.join(root, f)), false, f);
    }
  });
  it('nothing imports the old editor, form, or the unversioned writing mutations outside the API slice', () => {
    const offenders = walk('src').filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith('apiSlice.js'))
      .filter((f) => /\b(WritingEditor|WritingForm|ContentForm|useUpdateWritingMutation|useAddWritingMutation)\b/.test(read(f)));
    assert.deepEqual(offenders, []);
  });
  it('/create-writing redirects to the studio and the dashboard Writings section redirects too', () => {
    assert.match(read('src/app/create-writing/page.js'), /redirect\("\/admin\/writings\/new"\)/);
    assert.match(read('src/app/admin/AdminShell.jsx'), /href: '\/admin\/writings'/);
    assert.doesNotMatch(read('src/app/admin/Dashboard/index.js'), /<ContentSection type="writings"/);
    assert.ok(!fs.existsSync(path.join(root, 'src/app/admin/Dashboard/components/editors/MarkdownEditor.jsx')), 'retired Markdown editor must stay deleted');
  });
  it('the API still rejects an unversioned update (428), so no legacy path can silently overwrite', () => {
    assert.match(read('src/lib/writing-service.js'), /428/);
  });
});
