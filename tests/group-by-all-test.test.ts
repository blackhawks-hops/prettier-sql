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

describe("GROUP BY ALL Syntax", () => {
    test("Simple GROUP BY ALL", async () => {
        const sql = "SELECT col1, COUNT(*) FROM table1 GROUP BY ALL;";
        const result = await formatSQL(sql);
        expect(result).toContain("GROUP BY ALL");
    });
});
