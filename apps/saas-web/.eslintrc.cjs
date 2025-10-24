module.exports = {
  root: true,
  extends: ["../../packages/eslint-config"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    ecmaVersion: 2022,
    sourceType: "module"
  },
  env: {
    browser: true,
    es2022: true
  },
  plugins: ["import"]
};
