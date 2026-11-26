// Server-side handling of the optional rich-editor body for Tech Blog posts and Projects.
// Clients send { contentFormat: 'tiptap', doc }. The document is validated against the shared contract and the
// legacy string field is replaced by a derived plain-text projection (used for excerpts, search and word counts).
// Anything else is stored as legacy Markdown and any stray `doc` is dropped, so a document can never be smuggled in unvalidated.
import { validateDoc, docToPlainText } from './content-contract/document.js';
import { sanitizeHtml } from './sanitize.js';

const MAX_DOC_BYTES = 1_000_000;

/**
 * Mutates `data`. Returns an error string, or null when the body is fine.
 * @param {object} data request payload
 * @param {string} textField 'content' (tech blog) or 'longDescription' (project)
 * @param {number} maxText longest allowed derived text
 */
export function applyRichBody(data, textField, maxText = Infinity) {
  if (data.contentFormat !== 'tiptap') {
    delete data.doc;
    if (data.contentFormat !== undefined) data.contentFormat = 'markdown';
    return null;
  }
  const doc = data.doc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'A rich-text document is required';
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return 'Document is too large';
  const result = validateDoc(doc);
  if (!result.ok) return `Invalid document: ${result.errors.slice(0, 3).join('; ')}`;
  const text = sanitizeHtml(docToPlainText(doc)).trim().slice(0, maxText);
  if (!text) return 'Content is required';
  data[textField] = text;
  return null;
}
