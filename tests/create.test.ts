import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("CREATE", () => {
    test.skip("formats a simple create statement", async () => {
        const unformatted = `CREATE TABLE users (id INT, name VARCHAR(100), email VARCHAR(100), status VARCHAR(20));`;

        const expected = `CREATE TABLE users (
    id INT
    , name VARCHAR(100) COMMENT 'User name'
    , email VARCHAR(100)
    , status VARCHAR(20)
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
