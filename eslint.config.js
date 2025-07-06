import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist"] },
    {
        extends: tseslint.configs.recommended,
        files: ["**/*.ts"],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
            parser: tseslint.parser,
            parserOptions: {
                project: "./tsconfig.json",
                ecmaVersion: 2020,
                sourceType: "module"
            }
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    }
);
