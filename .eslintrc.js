module.exports = {
    parser: "@typescript-eslint/parser",
    extends: ["plugin:@typescript-eslint/recommended"],
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
    },
    ignorePatterns: ["dist/", "node_modules/"],
    rules: {
        // Allow 'any' in declarations.d.ts and type assertions
        "@typescript-eslint/no-explicit-any": "off"
    },
};
