import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("PIVOT syntax support", () => {
    test("Simple PIVOT with specific values", async () => {
        const sql = `SELECT * FROM sales PIVOT(SUM(amount) FOR quarter IN ('Q1', 'Q2', 'Q3', 'Q4'))`;
        const expected = `SELECT *
FROM sales
PIVOT(SUM(amount) FOR quarter IN ('Q1', 'Q2', 'Q3', 'Q4'))
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });

    test("PIVOT with ANY ORDER BY", async () => {
        const sql = `SELECT * FROM grp_id_clause PIVOT(SUM(cap_adjusted) FOR clause IN (ANY ORDER BY clause))`;
        const expected = `SELECT *
FROM grp_id_clause
PIVOT(SUM(cap_adjusted) FOR clause IN (ANY ORDER BY clause))
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });

    test("Complex query with PIVOT in CTE", async () => {
        const sql = `WITH pivoted AS (
    SELECT *
    FROM grp_id_clause
        PIVOT(SUM(cap_adjusted) FOR clause IN (ANY ORDER BY clause))
)
SELECT * FROM pivoted`;
        const expected = `WITH pivoted AS (
    SELECT *
    FROM grp_id_clause
    PIVOT(SUM(cap_adjusted) FOR clause IN (ANY ORDER BY clause))
)
SELECT *
FROM pivoted
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });

    test("UNPIVOT syntax", async () => {
        const sql = `SELECT * FROM quarterly_sales UNPIVOT(amount FOR quarter IN (Q1, Q2, Q3, Q4))`;
        const expected = `SELECT *
FROM quarterly_sales
UNPIVOT(amount FOR quarter IN (Q1, Q2, Q3, Q4))
;`;

        const result = await prettier.format(sql, options);
        expect(result.trim()).toBe(expected);
    });
});