// Shared constants for the e2e run. Everything points at a throwaway local MongoDB and a free port.
export const PORT = Number(process.env.E2E_PORT || 3411);
export const BASE = `http://127.0.0.1:${PORT}`;
export const MONGO = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27118/admin_test';
export const ADMIN = { email: 'e2e-admin@example.test', password: process.env.E2E_ADMIN_PASSWORD || 'unset' };
export const CHROME = process.env.E2E_CHROME || `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
