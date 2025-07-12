import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("GRANT", () => {
    test("Single grant", async () => {
        const unformatted = `grant usage on schema instat to role READERS;`;
        const expected = `GRANT USAGE ON SCHEMA instat TO ROLE READERS;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Multiple grants", async () => {
        const unformatted = `grant usage ON schema instat to role READERS; grant SELECT ON FUTURE TABLES IN schema instat to role READERS; grant SELECT ON FUTURE VIEWS IN schema instat to role READERS;`;

        const expected = `GRANT USAGE ON SCHEMA instat TO ROLE READERS;
GRANT SELECT ON FUTURE TABLES IN SCHEMA instat TO ROLE READERS;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA instat TO ROLE READERS;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
