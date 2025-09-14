module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'eslint:recommended',
  ],
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
  },
  ignorePatterns: [
    'node_modules/*',
    '.next/*',
    'out/*',
    'public/*',
    '**/*.config.js',
    '**/*.config.mjs',
  ],
};
