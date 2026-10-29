
# SECURITY HARDENING — ADMIN CMS, AUTHENTICATION, CONTENT MANAGEMENT, AND BACKEND APIs

## Role

Act as a principal application security engineer, web penetration-testing specialist, API security architect, identity and access-management specialist, and secure software engineering lead.

Your assignment is to harden my private portfolio administration platform. It manages public website content, including writings, Quill/Tamil literature, blog posts, portfolio projects, demos, media, and related content.

The platform is intended to operate at:

`https://admin.ajithkumar.com`

The related public site is described as:

`https://ajithkumar.com`

A separately referenced portfolio also exists at `https://www.ajithkumarr.com`. Verify the exact intended domains and repository remotes before changing deployment configuration.

This is a security-first task. The priority is to protect administrator access, private content, content integrity, uploaded media, application secrets, and all APIs that create, update, publish, or delete content.

Inspect the repository, implement necessary fixes, and verify them with tests. Do not stop at a checklist or report.

## 1. Map the architecture and trust boundaries

Inspect the complete repository before making changes.

Identify:

- Framework, runtime, versions, routing structure, and hosting.
- Authentication provider and session-management strategy.
- User model, roles, privileges, and account recovery flows.
- API routes, Server Actions, middleware, webhooks, and background jobs.
- Database, ORM, storage services, and privileged credentials.
- Rich-text editor, Markdown renderer, image processing, upload pipeline, and media delivery.
- Publishing workflow, preview workflow, drafts, scheduling, deletion, and revision history.
- Email, logging, monitoring, analytics, and other integrations.
- Deployment environments, build workflows, CI/CD configuration, and secrets management.
- Any shared services or data layer also used by the public portfolio.

Establish whether this is a single-administrator CMS or a multi-user administration platform. Implement appropriate controls for the actual design; do not invent unnecessary roles or break existing workflows.

Create a threat model for malicious unauthenticated users, compromised accounts, malicious content, leaked credentials, abusive bots, and potentially compromised integrations.

## 2. Authentication: make admin access robust

Audit login, logout, account registration, password reset, email verification, invitation, session renewal, and account recovery.

Implement or strengthen the following as appropriate to the existing authentication system:

- Strong authentication based on a maintained provider or library.
- Multi-factor authentication or passkeys for privileged accounts where supported.
- Secure password storage if the application manages passwords itself.
- Login throttling and protection against brute-force attempts and credential stuffing.
- Generic authentication error messages that avoid revealing whether an account exists.
- Secure password reset and account recovery with expiring, single-use tokens.
- Session rotation after login and privilege changes.
- Explicit logout and session revocation.
- Idle and absolute session expiration appropriate for an administrative interface.
- Re-authentication for particularly sensitive operations where justified.
- Protection against user enumeration and account takeover.

Do not build custom cryptographic authentication mechanisms if an appropriate, maintained solution already exists.

Do not treat a hidden admin URL, client-side route guard, obscure endpoint, CAPTCHA, or IP allowlist as a replacement for proper authentication.

If network-level access restrictions are available, evaluate them as an additional security layer rather than the only access control.

## 3. Secure session and cookie configuration

Inspect all session cookies and authentication tokens.

For cookie-based sessions:

- Use HTTPS-only cookies.
- Set `Secure`, `HttpOnly`, and an appropriate explicit `SameSite` value.
- Prefer host-only session cookies.
- Use the `__Host-` cookie prefix where compatible with the session architecture.
- Avoid setting `Domain=.ajithkumar.com` or another parent-domain scope unless there is a demonstrated, necessary reason.
- Use `Path=/` for `__Host-` cookies.
- Rotate session identifiers after authentication and privilege changes.
- Revoke sessions appropriately on logout, password reset, account suspension, and credential compromise.

For token-based sessions, inspect token storage, expiration, audience, issuer, signature validation, refresh rotation, revocation, and exposure risks.

Do not store long-lived privileged access tokens in `localStorage` by default. Use an architecture appropriate to the authentication provider and the application's threat model.

Because the public site and admin application use related branding, verify they do not inadvertently share privileged session cookies or authentication state across subdomains.

Confirm the exact registrable domain before changing cookie scope.

## 4. Authorization: protect every privileged operation

Audit every API endpoint, Server Action, upload handler, publishing operation, and database mutation.

Enforce server-side authentication and authorization on each protected operation.

Do not rely on:

- Hidden navigation items.
- Client-side role checks.
- Middleware alone.
- IDs being difficult to guess.
- A route being outside the normal UI.
- The frontend submitting only approved fields.

Apply deny-by-default authorization and verify object-level access for every resource identifier.

Check for:

- Unauthorized reading of private drafts or account data.
- Unauthorized creation, editing, publishing, unpublishing, or deleting.
- Privilege escalation through role or ownership fields.
- Mass assignment of protected properties.
- Access to another user's or another project's records when applicable.
- Access to private media and preview tokens.
- Administrative operations exposed through GET requests.
- Authentication bypass in Server Actions or alternate API routes.
- Authorization gaps between the UI, API, and database.

Define a clear permission matrix for the actual user roles and resource operations. Keep permission checks centralized and reusable where practical.

Validate authorization at the server or data-access boundary, not merely at the page level.

## 5. CSRF, CORS, and request-origin validation

Determine whether the application authenticates requests through browser cookies or another mechanism.

For cookie-authenticated state-changing operations, implement appropriate CSRF protection. This may include secure CSRF tokens, strict Origin/Referer validation, Fetch Metadata checks, and SameSite cookies as appropriate.

Ensure:

- State-changing operations never use GET.
- Unsafe requests are validated on the server.
- Origin checks compare exact origins, not loose hostname suffixes.
- CORS allows only explicitly required origins.
- Wildcard origins are not combined with credentials.
- The public portfolio cannot call privileged admin APIs merely because it is a related domain.
- Webhooks and deliberate third-party integrations have documented, narrowly scoped exceptions.

Do not disable CSRF protections globally to make a frontend request work. Fix the request flow and server-side verification appropriately.

## 6. Secure API design and request processing

Inventory the full API surface, including unlinked endpoints, legacy handlers, internal routes, Server Actions, webhooks, and development/debug endpoints.

Use the OWASP API Security Top 10 and OWASP ASVS as the main audit frameworks.

Check for:

- Broken authentication.
- Broken object-, function-, and property-level authorization.
- Excessive data exposure.
- Mass assignment.
- Missing request-schema validation.
- SQL/NoSQL injection and unsafe query construction.
- Path traversal, command injection, and unsafe file operations.
- SSRF or arbitrary URL fetching.
- Unrestricted resource consumption.
- Missing rate limits.
- Unsafe external API consumption.
- Improper HTTP method handling.
- Verbose error messages.
- Debug, test, and administrative endpoints unintentionally exposed.

Validate input using schemas appropriate to the project's existing stack. Reject unexpected fields where suitable and construct explicit data-transfer objects for database mutations.

Enforce reasonable limits for body size, field length, array length, pagination, query complexity, upload size, timeouts, and concurrent work.

Use appropriate response codes and generic client-facing errors. Do not expose stack traces, raw database errors, environment details, secrets, or internal implementation information.

## 7. Rich-text content, stored XSS, and publishing security

This is one of the highest-priority areas because the admin application manages content that may be rendered publicly.

Inspect the complete journey of every content type:

Admin editor → request validation → database → preview → publishing → public API → public HTML rendering.

Cover:

- Markdown and rich-text content.
- HTML support, embedded media, links, and images.
- Blog posts, poetry, lyrics, essays, and project descriptions.
- Code snippets and syntax highlighting.
- Imported or pasted content.
- Preview rendering and unpublished drafts.
- Metadata generated from user-controlled text.

Stored XSS must be considered a cross-application risk: malicious content could target an administrator in the preview interface or a public visitor on the portfolio website.

Implement server-side input validation and context-appropriate output handling. For intentionally supported HTML, use a maintained sanitizer and a documented allowlist. Restrict dangerous elements, attributes, URLs, embedded objects, and event handlers.

Do not break valid Tamil text, typography, Markdown formatting, poetry line breaks, or legitimate code blocks while sanitizing.

Ensure sanitization cannot be bypassed by a later transformation or alternate rendering path.

Treat previews as privileged functionality. Require authenticated access, prevent public exposure of unpublished content, and avoid reusable or indefinitely valid preview tokens.

Verify that only authorized content can transition into a published state.

## 8. Protect file uploads and media processing

Inspect every upload path for featured images, book covers, project images, document attachments, audio, video, or other supported media.

Implement:

- Strict file-type and extension allowlists.
- File-signature verification rather than trusting Content-Type.
- Maximum upload sizes and suitable content-specific limits.
- Generated storage keys rather than user-controlled paths.
- Path traversal defenses.
- Safe image decoding and re-encoding where appropriate.
- Safe handling or rejection of active content such as HTML and SVG.
- Authorization before upload, replacement, deletion, and access to private files.
- Appropriate storage permissions and signed URL lifetimes.
- Protection against public uploads being used to exhaust storage or processing capacity.
- Malware scanning where suitable for the supported file types and operational environment.

Audit image proxying, remote URL import, transformation endpoints, and metadata extraction for SSRF, decompression, and resource-consumption risks.

Do not deploy an upload system that treats a client-provided filename or MIME type as trustworthy.

## 9. Database and content integrity

Inspect database connections, service credentials, query construction, permissions, backups, and data lifecycle.

Enforce least-privilege access. Keep privileged database credentials exclusively on the server.

Verify that:

- Draft and published states have clear, enforceable access policies.
- Mutations cannot bypass validation or authorization.
- Related media and records cannot be deleted or replaced by unauthorized users.
- Publishing and unpublishing transitions follow valid business rules.
- Sensitive values are not returned unnecessarily.
- Production credentials cannot access unrelated services without justification.
- Backups are protected, access-controlled, and restorable.
- Database migrations and bulk operations are handled safely.
- Audit history exists for consequential content-management actions where appropriate.

If a database provider supports row-level security or equivalent access policies, verify its actual role in the architecture. Do not assume application-level checks are replaced by database rules or vice versa.

Test restoration procedures where a safe environment exists. Never run destructive recovery tests against the production database.

## 10. Secrets management and dependency integrity

Inspect environment files, Git history, CI/CD workflows, deployment variables, package scripts, lockfiles, and client bundles.

Check for:

- Hardcoded passwords, tokens, API keys, and connection strings.
- Secrets exposed through frontend environment variables.
- Shared credentials between public and admin applications.
- Excessively privileged database, email, and media API keys.
- Debug or test credentials in production.
- Vulnerable or abandoned packages.
- Supply-chain risks in dependencies and build scripts.
- Unsafe deployment permissions.
- Missing credential-rotation procedures.

Run appropriate dependency and secret scanners where available.

Redact all discovered secret values. Never include their contents in a report, commit them elsewhere, or send them to an external scanner without explicit authorization.

If a secret has been exposed, recommend rotation and revocation rather than merely deleting the current reference.

Do not apply uncontrolled dependency upgrades. Fix confirmed critical vulnerabilities first, then evaluate other upgrades for risk and compatibility.

## 11. Security headers and administrative browser protections

Inspect actual deployed headers and configuration.

Evaluate:

- HTTPS and HSTS.
- Content-Security-Policy.
- `frame-ancestors` and clickjacking protection.
- X-Content-Type-Options.
- Referrer-Policy.
- Permissions-Policy.
- Appropriate cache controls.
- Cross-origin isolation policies where justified.

The admin interface should generally have a stricter policy than the public portfolio.

Disallow framing of the admin application unless a documented feature genuinely requires it. Keep CSP aligned with actual script, image, API, and authentication-provider requirements.

Introduce restrictive CSP policies with testing or report-only monitoring where necessary. Avoid blanket rules that silently break login, the rich-text editor, uploads, previews, or normal administrative workflows.

Do not blindly add HSTS `includeSubDomains` or preload without verifying the domain and all relevant subdomains' HTTPS readiness.

## 12. Audit logging and incident readiness

Record security-relevant events such as:

- Successful and failed authentication.
- Session revocation and recovery.
- Privilege or permission changes.
- Creation, publication, unpublishing, and deletion.
- Media uploads, replacements, and deletions.
- Rejected authorization attempts.
- Suspicious request patterns.
- Configuration or security-setting changes.

Record sufficient metadata to investigate incidents, using redaction and data minimization.

Do not log passwords, raw tokens, session cookies, secret keys, private content bodies, or unnecessary personal information.

Ensure users cannot trivially erase or alter audit records through ordinary CMS operations.

Verify monitoring and alerting paths where configured. Produce a practical response checklist covering suspected account compromise, exposed credentials, malicious published content, and unauthorized deletion.

## 13. Rate limiting, brute-force resistance, and abuse control

Protect login, password reset, invitation, search, preview, uploads, content mutation, and other expensive or sensitive endpoints.

Use rate limits and quotas appropriate to each operation and the available infrastructure. Account for distributed hosting, proxies, and trustworthy client-IP handling.

Do not trust arbitrary forwarded-IP headers without correctly configuring trusted proxy boundaries.

Protect against resource exhaustion and automated abuse without creating unnecessary lockout or denial-of-service risks for legitimate administrators.

Use step-up verification or re-authentication where justified for highly sensitive actions.

## 14. Integration security with the public portfolio

Identify exactly how the public site gets its content.

Establish which services are shared, where credentials live, which origins are permitted, and which operations are public versus privileged.

The admin application must never:

- Depend on the public site being trustworthy for authorization.
- Expose database credentials to the browser.
- Grant the public origin unrestricted mutation rights.
- Return unpublished content through public endpoints.
- Issue privileged tokens to client-side code.
- Share a broadly scoped session cookie with unrelated subdomains without a documented security design.

Coordinate any necessary API contract changes with the public portfolio repository. Record required changes to the frontend, database policies, deployment configuration, and environment variables.

Do not make incompatible changes without documenting the dependency and test plan.

## 15. Automated security tests

Create or extend tests for the actual implementation.

At minimum, test relevant cases such as:

- Unauthenticated access to protected pages, APIs, and Server Actions.
- Authorized and unauthorized role combinations.
- Cross-user or cross-record access.
- Invalid session and expired token behavior.
- CSRF failures on protected state changes.
- Origin and CORS validation.
- Missing or unexpected input fields.
- Unauthorized publishing and deletion.
- Stored XSS sanitization and safe public rendering.
- Invalid file types, oversized uploads, and unauthorized media changes.
- Rate-limit behavior.
- Information leakage in error responses.
- Draft-versus-published access.
- Appropriate cookie flags and response headers.

Use isolated test accounts, synthetic fixtures, and local or staging environments. Tests must not modify real content or send destructive requests to production.

Do not write tests that simply confirm an existing implementation without exercising the security boundary.

## 16. Deployment and operations

Inspect deployment configuration, environment separation, CI/CD permissions, production debug settings, allowed domains, TLS, secret injection, logging, backups, and rollback procedures.

Identify any settings that are enforced by a hosting provider rather than the repository.

Do not modify DNS, production environment variables, access policies, database permissions, or production secrets without appropriate authorization.

Document deployment-only actions separately from code changes.

## 17. Final deliverables

Provide a security report containing:

1. Architecture and threat model.
2. Asset inventory and trust boundaries.
3. Findings with severity, evidence, impact, and affected routes or files.
4. Fixes implemented.
5. Authentication, session, authorization, API, content-rendering, and upload test results.
6. Dependency and secret-scan results, with values redacted.
7. Build, lint, type-check, and regression-test results.
8. Cross-repository integration requirements.
9. Production configuration changes still required.
10. Remaining risks and remediation priorities.

For Critical and High findings, include a clear explanation of the exploit preconditions, practical impact, fix, and test used to verify the fix.

Use OWASP ASVS 5.0.0 as the overall application security verification framework and OWASP API Security Top 10 as the API-specific reference. Reference the relevant requirements where useful.

Do not claim that the application is secure or penetration-tested merely because the build passes. Clearly state the limits of the verification performed.

Preserve all legitimate CMS functionality, including Tamil writing, rich formatting, project management, media uploads, previews, drafts, and publishing.

Begin with the repository audit, fix confirmed high-risk vulnerabilities, and verify each change. Do not deploy to production without explicit authorization.
