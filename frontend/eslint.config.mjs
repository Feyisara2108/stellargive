import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));

// Flat config (ESLint 9). `next lint` was removed in Next.js 16, so `npm run lint`
// calls ESLint directly with the same core-web-vitals preset the old .eslintrc used.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    // Lets the Next.js rules find the app when ESLint runs from the repo root
    // (the pre-commit hook) rather than from frontend/.
    settings: { next: { rootDir } },
  },
  {
    // eslint-config-next 16 newly enables the React Compiler rules as errors. They flag
    // real issues but predate this config, so they warn until they are fixed down.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    ignores: [
      ".next/**",
      "out/**",
      "coverage/**",
      "storybook-static/**",
      "playwright-report/**",
      "test-results/**",
      "src/lib/bindings/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
