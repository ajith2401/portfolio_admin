import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "public/**",
      "**/*.config.js",
      "**/*.config.mjs",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      // New in eslint-config-next 16 (React Compiler rules); not enforced before the upgrade.
      // Kept visible as warnings; fix them in components as they are touched.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
