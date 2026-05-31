import globals from "globals";
import js from "@eslint/js";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    ignores: [
      "**/*",
      "!src/**",
      "!test/**",
      "!admin/jsonConfig.json",
      "!io-package.json",
      "!package.json",
      "!eslint.config.mjs",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,mts,cts}"],
    languageOptions: {
      ...config.languageOptions,
      globals: globals.node,
    },
  })),
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
  },
]);
