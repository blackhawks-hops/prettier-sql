import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("GROUP BY ALL", () => {
    test("Simple GROUP BY ALL", async () => {
        const unformatted = `SELECT col1, COUNT(*) FROM table1 GROUP BY ALL`;
        const expected = `SELECT col1
     , COUNT(*)
FROM table1
GROUP BY ALL
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted).toBe(expected);
    });

    test("GROUP BY ALL with subquery (from sandbox.sql)", async () => {
        const unformatted = `SELECT id, AVG(measure) AS mean_measure FROM foo.bar JOIN foo.baz using(id) GROUP BY ALL`;
        const expected = `SELECT id
     , AVG(measure) AS mean_measure
FROM foo.bar
JOIN foo.baz USING(id)
GROUP BY ALL
;`;
        const formatted = await prettier.format(unformatted, options);
        expect(formatted).toBe(expected);
    });

    test("GROUP BY ALL with HAVING", async () => {
        const unformatted = `
        SELECT col1, COUNT(*) as cnt
        FROM table1
        GROUP BY ALL
        HAVING COUNT(*) > 5
        `;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted).toContain("GROUP BY ALL");
        expect(formatted).toContain("HAVING");
    });

    test("GROUP BY ALL with ORDER BY", async () => {
        const unformatted = `
        SELECT col1, COUNT(*) as cnt
        FROM table1
        GROUP BY ALL
        ORDER BY col1
        `;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted).toContain("GROUP BY ALL");
        expect(formatted).toContain("ORDER BY");
    });
});
