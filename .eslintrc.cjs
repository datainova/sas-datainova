module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier'
  ],
  env: {
    es2022: true,
    node: true
  },
  overrides: [
    {
      files: ['*.tsx', '*.jsx'],
      settings: {
        react: {
          version: 'detect'
        }
      }
    }
  ],
  ignorePatterns: ['dist', 'build', 'node_modules']
};
