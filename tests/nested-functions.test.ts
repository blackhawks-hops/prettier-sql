import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("Nested functions", () => {
    test("Functions with CAST expressions as arguments", async () => {
        const unformatted = `SELECT COALESCE(CAST(col1 AS DATE), CAST(col2 AS DATE)) AS result FROM table1`;
        
        const formatted = await prettier.format(unformatted, options);
        console.log("Formatted:", formatted.trim());
        
        // The key expectation is that CAST expressions should be preserved in function arguments
        expect(formatted).toContain("COALESCE(CAST(col1 AS DATE), CAST(col2 AS DATE))");
    });

    test("Multiple levels of nested functions", async () => {
        const unformatted = `SELECT CONCAT(UPPER(COALESCE(name, 'Unknown')), LOWER(SUBSTR(code, 1, 3))) AS formatted_name FROM table1`;
        
        const formatted = await prettier.format(unformatted, options);
        console.log("Formatted:", formatted.trim());
        
        expect(formatted).toContain("CONCAT(UPPER(COALESCE(");
        expect(formatted).toContain("LOWER(SUBSTR(");
    });

    test("Nested COALESCE functions with CAST", async () => {
        const unformatted = `SELECT COALESCE(COALESCE(blend.last_updated, CAST('1900-01-01' AS DATE)), COALESCE(opa.last_updated, CAST('1900-01-01' AS DATE))) AS last_updated FROM table1`;
        
        const formatted = await prettier.format(unformatted, options);
        console.log("Formatted:", formatted.trim());
        
        // Test that nested COALESCE functions work with CAST expressions
        expect(formatted).toContain("COALESCE(COALESCE(blend.last_updated");
        expect(formatted).toContain("COALESCE(opa.last_updated");
        expect(formatted).toContain("CAST('1900-01-01' AS DATE)");
    });
});