import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "dist-test/**", "node_modules/**", "test-results/**", "*.zip"] },
  js.configs.recommended,
  { rules: { "no-irregular-whitespace": ["error", { skipRegExps: true, skipStrings: true, skipTemplates: true }] } },
  ...tseslint.configs.recommended,
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", chrome: "readonly" } } },
);
