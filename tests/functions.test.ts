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

describe("Concatenation operators", () => {
    test("Simple || concatenation", async () => {
        const sql = "SELECT first_name || ' ' || last_name FROM users;";
        const expected = `SELECT first_name || ' ' || last_name
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("|| concatenation with strings", async () => {
        const sql = "SELECT 'Hello ' || name || '!' FROM users;";
        const expected = `SELECT 'Hello ' || name || '!'
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("|| concatenation with functions", async () => {
        const sql = "SELECT YEAR(birthday) || '-' || MONTH(birthday) FROM users;";
        const expected = `SELECT YEAR(birthday) || '-' || MONTH(birthday)
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("|| concatenation with numbers", async () => {
        const sql = "SELECT id || '-' || YEAR(created_date) FROM orders;";
        const expected = `SELECT id || '-' || YEAR(created_date)
FROM orders
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("|| concatenation with arithmetic", async () => {
        const sql = "SELECT name || ' is ' || (age + 5) || ' years old' FROM users;";
        const expected = `SELECT name || ' is ' || age + 5 || ' years old'
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Mixed CONCAT function and || operator", async () => {
        const sql = "SELECT CONCAT(first_name, ' ') || last_name || CONCAT(' (', age, ')') FROM users;";
        const expected = `SELECT CONCAT(first_name, ' ') || last_name || CONCAT(' (', age, ')')
FROM users
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("|| in WHERE clause", async () => {
        const sql = "SELECT * FROM users WHERE first_name || last_name = 'JohnDoe';";
        const expected = `SELECT *
FROM users
WHERE first_name || last_name = 'JohnDoe'
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("Case with || concatenation", async () => {
        const sql =
            "SELECT *, (CASE WHEN CURRENT_DATE() > YEAR(CURRENT_DATE) || '-08-01' THEN YEAR(CURRENT_DATE) || YEAR(CURRENT_DATE)+1 ELSE YEAR(CURRENT_DATE)-1 || YEAR(CURRENT_DATE) END)::INT AS cur_season FROM season;";
        const expected = `SELECT *
     , (CASE WHEN CURRENT_DATE > YEAR(CURRENT_DATE()) || '-08-01' THEN YEAR(CURRENT_DATE()) || YEAR(CURRENT_DATE()) + 1 ELSE YEAR(CURRENT_DATE()) - 1 || YEAR(CURRENT_DATE()) END)::INT AS cur_season
FROM season
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

    test("TABLE(GENERATOR()) with ROWCOUNT", async () => {
        const sql = `SELECT DATE_TRUNC('MONTH', DATEADD(MONTH, seq4(), '2020-01-01'))::date AS first_of_month
        FROM TABLE(GENERATOR(ROWCOUNT => 1000))
        WHERE DATEADD(MONTH, seq4(), '2020-01-01') <= CURRENT_DATE;`;
        
        const expected = `SELECT DATE_TRUNC('MONTH', DATEADD(month, SEQ4(), '2020-01-01'))::DATE AS first_of_month
FROM TABLE(GENERATOR(ROWCOUNT => 1000))
WHERE DATEADD(month, SEQ4(), '2020-01-01') <= CURRENT_DATE
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("TABLE(GENERATOR()) with ROWCOUNT and TIMELIMIT", async () => {
        const sql = `SELECT seq4(), uniform(1, 10, RANDOM(12)) 
        FROM TABLE(GENERATOR(ROWCOUNT => 10, TIMELIMIT => 60));`;
        
        const expected = `SELECT SEQ4()
     , UNIFORM(1, 10, RANDOM(12))
FROM TABLE(GENERATOR(ROWCOUNT => 10, TIMELIMIT => 60))
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });

    test("TABLE(GENERATOR()) simple ROWCOUNT", async () => {
        const sql = `SELECT 'MY_VALUE' as MY_FIELD_NAME FROM TABLE(GENERATOR(rowcount => 5));`;
        
        const expected = `SELECT 'MY_VALUE' AS MY_FIELD_NAME
FROM TABLE(GENERATOR(ROWCOUNT => 5))
;`;
        const result = await formatSQL(sql);
        expect(result).toBe(expected);
    });
});
