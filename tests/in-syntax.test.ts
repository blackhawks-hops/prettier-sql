import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("IN syntax formatting", () => {
    test("NOT IN clause from real query", async () => {
        const sql =
            "SELECT * FROM hawks_analytics.SEASON_LOP_SAMPLE_STATS ss WHERE ss.super_component NOT IN ('OPA_OFFENSE', 'PENALTIES', 'FACEOFFS')";
        const expected = `SELECT *
FROM hawks_analytics.season_lop_sample_stats ss
WHERE ss.super_component NOT IN ('OPA_OFFENSE', 'PENALTIES', 'FACEOFFS')
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });

    test("IN clause with numeric values", async () => {
        const sql = "SELECT * FROM users WHERE id IN (1, 2, 3, 4, 5)";
        const expected = `SELECT *
FROM users
WHERE id IN (1, 2, 3, 4, 5)
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });

    test("IN clause with string values", async () => {
        const sql = "SELECT * FROM products WHERE category IN ('electronics', 'books', 'clothing')";
        const expected = `SELECT *
FROM products
WHERE category IN ('electronics', 'books', 'clothing')
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });

    test("Multiple IN clauses", async () => {
        const sql = "SELECT * FROM orders WHERE status IN ('pending', 'shipped') AND priority NOT IN (1, 2)";
        const expected = `SELECT *
FROM orders
WHERE status IN ('pending', 'shipped')
  AND priority NOT IN (1, 2)
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });
});
