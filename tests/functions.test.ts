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

describe("SQL Functions", () => {
    test("LEFT function", async () => {
        const sql = "SELECT LEFT(column_name, 5) FROM table1;";
        const expected = `SELECT LEFT(column_name, 5)
FROM table1
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("RIGHT function", async () => {
        const sql = "SELECT RIGHT(column_name, 3) FROM table1;";
        const expected = `SELECT RIGHT(column_name, 3)
FROM table1
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("CONCAT function with two arguments", async () => {
        const sql = "SELECT CONCAT(first_name, last_name) FROM users;";
        const expected = `SELECT CONCAT(first_name, last_name)
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("CONCAT function with three arguments", async () => {
        const sql = "SELECT CONCAT(first_name, ' ', last_name) FROM users;";
        const expected = `SELECT CONCAT(first_name, ' ', last_name)
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("YEAR function", async () => {
        const sql = "SELECT YEAR(birthday) FROM users;";
        const expected = `SELECT YEAR(birthday)
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("MONTH function", async () => {
        const sql = "SELECT MONTH(birthday) FROM users;";
        const expected = `SELECT MONTH(birthday)
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Nested functions", async () => {
        const sql = "SELECT CONCAT(LEFT(first_name, 1), RIGHT(last_name, 3)) FROM users;";
        const expected = `SELECT CONCAT(LEFT(first_name, 1), RIGHT(last_name, 3))
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Functions with complex expressions", async () => {
        const sql = "SELECT YEAR(birthday) + 10, CONCAT(name, ' (born ', YEAR(birthday), ')') FROM users;";
        const expected = `SELECT YEAR(birthday) + 10
     , CONCAT(name, ' (born ', YEAR(birthday), ')')
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });
});

describe("BETWEEN operator", () => {
    test("Simple BETWEEN with numbers", async () => {
        const sql = "SELECT * FROM users WHERE age BETWEEN 18 AND 65;";
        const expected = `SELECT *
FROM users
WHERE age BETWEEN 18 AND 65
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("BETWEEN with column references", async () => {
        const sql = "SELECT * FROM users WHERE created_date BETWEEN start_date AND end_date;";
        const expected = `SELECT *
FROM users
WHERE created_date BETWEEN start_date AND end_date
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("BETWEEN in CTE", async () => {
        const sql = `WITH filtered_users AS (
            SELECT * FROM users WHERE age BETWEEN 25 AND 45
        )
        SELECT * FROM filtered_users;`;
        const expected = `WITH filtered_users AS (
    SELECT *
    FROM users
    WHERE age BETWEEN 25 AND 45
)
SELECT *
FROM filtered_users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("BETWEEN with functions", async () => {
        const sql = "SELECT * FROM events WHERE YEAR(event_date) BETWEEN 2020 AND 2023;";
        const expected = `SELECT *
FROM events
WHERE YEAR(event_date) BETWEEN 2020 AND 2023
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("BETWEEN with complex expressions", async () => {
        const sql = "SELECT * FROM sales WHERE total_amount BETWEEN (base_price * 0.8) AND (base_price * 1.2);";
        const expected = `SELECT *
FROM sales
WHERE total_amount BETWEEN (base_price * 0.8) AND (base_price * 1.2)
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });
});