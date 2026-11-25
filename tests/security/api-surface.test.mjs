import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/app/api');
const routes = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(d, e.name));
    else if (e.name === 'route.js') routes.push(path.join(d, e.name));
  }
})(root);

// Intentionally public mutations (visitors rate/comment/subscribe/log in); all are rate limited.
const PUBLIC_MUTATIONS = [/login\/route\.js$/, /logout\/route\.js$/, /subscribe\/route\.js$/, /\/rate\/route\.js$/, /\/comments\/route\.js$/];

const methodBlocks = (src) => {
  const re = /export async function (POST|PUT|PATCH|DELETE)\b/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index + 1);
    const next = rest.search(/export async function /);
    out.push({ method: m[1], body: next === -1 ? rest : rest.slice(0, next) });
  }
  return out;
};

describe('API surface guard', () => {
  it('finds routes', () => assert.ok(routes.length > 10));
  for (const file of routes) {
    const src = fs.readFileSync(file, 'utf8');
    for (const { method, body } of methodBlocks(src)) {
      const rel = path.relative(process.cwd(), file);
      const isPublic = PUBLIC_MUTATIONS.some((r) => r.test(file));
      it(`${method} ${rel} is protected or explicitly public + rate limited`, () => {
        if (/logout\/route\.js$/.test(file)) return; // only clears the caller's own cookie
        if (isPublic) assert.match(body, /applyRateLimit|globalRateLimiter|export async function POST/, 'public mutation must be rate limited');
        else {
          assert.match(body, /requireAuth\(/, 'needs authentication');
          assert.match(body, /validateOrigin\(/, 'needs origin validation');
        }
      });
    }
  }
  it('no route reflects raw error.message to clients', () => {
    for (const file of routes) {
      const src = fs.readFileSync(file, 'utf8');
      assert.ok(!/json\(\s*\{\s*error:\s*error\.message/.test(src), `${file} leaks error.message`);
    }
  });
});
