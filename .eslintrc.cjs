module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  ignorePatterns: ["node_modules/", "dist/", "coverage/", "artifacts/"],
  overrides: [
    { files: ["apps/pc-app/ui/**/*.ts", "apps/pc-app/ui/**/*.tsx", "apps/pc-app/runtime/main/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
    // These PostgREST row adapters validate their wire DTOs at the authority
    // boundary; the schema-less JSON columns have the same dynamic typing as
    // the desktop IPC adapters above. Keep the exemption on these two files.
    { files: ["infra/supabase/functions/lingjing-battle/authority.ts", "infra/supabase/functions/lingjing-battle/handler.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
    // Deliberate destructuring removes private Auth UIDs from public room DTOs.
    { files: ["infra/supabase/functions/lingjing-battle/handler.ts", "infra/supabase/functions/lingjing-battle/projection.js"], rules: { "@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^_" }] } },
    // This canonical cross-runtime engine retains an internal status helper.
    { files: ["infra/supabase/functions/_shared/battle-core.js"], rules: { "@typescript-eslint/no-unused-vars": ["error", { "varsIgnorePattern": "^hasStatus$" }] } },
    // Control characters are intentionally refused in untrusted storage paths.
    { files: ["infra/supabase/functions/lingjing-resources/package.ts"], rules: { "no-control-regex": "off" } }
  ]
};
