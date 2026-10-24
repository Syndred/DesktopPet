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
  ignorePatterns: ["node_modules/", "dist/", "coverage/"],
  overrides: [{ files: ["apps/pc-app/ui/**/*.ts", "apps/pc-app/ui/**/*.tsx", "apps/pc-app/runtime/main/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } }]
};
