import { describe, test, expect } from "vitest";
import prettier from "prettier";
import * as sqlPlugin from "../src";

const formatSQL = async (sql: string): Promise<string> => {
    return await prettier.format(sql, {
        plugins: [sqlPlugin],
        parser: "sql",
        tabWidth: 4,
    });
};

describe("Arithmetic and Boolean Expressions", () => {
    test("PostgreSQL cast with arithmetic", async () => {
        const sql = "SELECT LEFT(s.season, 4)::int - year(birthday) AS season_age FROM players;";
        const expected = `SELECT LEFT(s.season, 4)::INT - YEAR(birthday) AS season_age
FROM players
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Function calls with arithmetic", async () => {
        const sql = "SELECT YEAR(created_date) + 1 AS next_year FROM events;";
        const expected = `SELECT YEAR(created_date) + 1 AS next_year
FROM events
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("PostgreSQL cast in arithmetic expression", async () => {
        const sql = "SELECT column_name::int + 5 FROM table1;";
        const expected = `SELECT column_name::INT + 5
FROM table1
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Complex arithmetic with multiple functions and casts", async () => {
        const sql = "SELECT (LEFT(season, 4)::int - YEAR(birthday)) * 2 + 1 AS complex_calc FROM players;";
        const expected = `SELECT LEFT(season, 4)::INT - YEAR(birthday) * 2 + 1 AS complex_calc
FROM players
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Boolean expressions between functions", async () => {
        const sql = "SELECT * FROM players WHERE YEAR(birthday) > 1990 AND MONTH(birthday) < 6;";
        const expected = `SELECT *
FROM players
WHERE YEAR(birthday) > 1990
  AND MONTH(birthday) < 6
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });
});