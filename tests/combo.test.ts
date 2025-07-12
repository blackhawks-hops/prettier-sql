import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("Combination of several types together", () => {
    test("Create schema, grant permissions, create a table", async () => {
        const unformatted = `create schema foo;grant all on schema foo to role bar;create table foo.bar (id int);`;
        const expected = `CREATE SCHEMA foo;

GRANT ALL ON SCHEMA foo TO ROLE bar;

CREATE TABLE foo.bar (
      id INT
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
