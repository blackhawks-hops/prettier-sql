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

describe("Decimal Number Preprocessing", () => {
    test("Simple decimal with dot prefix", async () => {
        const sql = "SELECT .5 as test;";
        const expected = `SELECT 0.5 AS test\n;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Decimal in arithmetic expression", async () => {
        const sql = "SELECT 1 * .75 as test;";
        const expected = `SELECT 1 * 0.75 AS test\n;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Table.column should not be affected", async () => {
        const sql = "SELECT table.column FROM test;";
        const expected = `SELECT table.column\nFROM test\n;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });
});
