import prettier from "prettier";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    parser: "sql",
};

describe("SQL Formatter", () => {
    test("formats a simple SELECT statement", async () => {
        const unformatted = `
      SELECT id, name, email FROM users WHERE status = 'active';
    `;

        const expected = `SELECT id
     , name
     , email
FROM users
WHERE status = 'active';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats multiple columns and conditions", async () => {
        const unformatted = `
      SELECT id, first_name, last_name, email, phone, address, city, state, zip_code
      FROM customers
      WHERE status = 'active' AND created_at > '2023-01-01' AND country = 'USA';
    `;

        const expected = `SELECT id
     , first_name
     , last_name
     , email
     , phone
     , address
     , city
     , state
     , zip_code
FROM customers
WHERE status = 'active'
  AND created_at > '2023-01-01'
  AND country = 'usa';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats a simple JOIN", async () => {
        const unformatted = `
      SELECT u.id, u.name, o.order_id, o.total
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE u.status = 'active';
    `;

        const expected = `SELECT u.id
     , u.name
     , o.order_id
     , o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats CTEs", async () => {
        const unformatted = `
      WITH active_users AS (
        SELECT id, name, email FROM users WHERE status = 'active'
      ),
      recent_orders AS (
        SELECT user_id, COUNT(*) as order_count FROM orders WHERE created_at > '2023-01-01' GROUP BY user_id
      )
      SELECT u.id, u.name, u.email, COALESCE(o.order_count, 0) as order_count
      FROM active_users u
      LEFT JOIN recent_orders o ON u.id = o.user_id;
    `;

        const expected = `WITH active_users AS (
    SELECT id
         , name
         , email
    FROM users
    WHERE status = 'active'
)
, recent_orders AS (
    SELECT user_id
         , count(*) as order_count
    FROM orders
    WHERE created_at > '2023-01-01'
)
SELECT u.id
     , u.name
     , u.email
     , COALESCE(o.order_count, 0) as order_count
FROM active_users u
LEFT JOIN recent_orders o ON u.id = o.user_id;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats multiple WHERE conditions", async () => {
        const unformatted = `
      SELECT * FROM products WHERE category = 'electronics' AND price > 100 AND stock > 0 AND manufacturer = 'Apple';
    `;

        const expected = `SELECT *
FROM products
WHERE category = 'electronics'
  AND price > 100
  AND stock > 0
  AND manufacturer = 'apple';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats complex query with the example from README", async () => {
        const unformatted = `
      WITH cte1 AS (SELECT column1, column2, column3 FROM table1 WHERE column1 = 'value1' AND column2 = 'value2'),
      cte2 AS (SELECT column4, column5 FROM table2 WHERE column4 = 'value3')
      SELECT column1, column2, column3, column4, column5 FROM cte1 JOIN cte2 ON cte1.column1 = cte2.column4 WHERE cte1.column2 = 'value4' AND cte2.column5 = 'value5';
    `;

        const expected = `WITH cte1 AS (
    SELECT column1
         , column2
         , column3
    FROM table1
    WHERE column1 = 'value1'
      AND column2 = 'value2'
)
, cte2 AS (
    SELECT column4
         , column5
    FROM table2
    WHERE column4 = 'value3'
)
SELECT column1
     , column2
     , column3
     , column4
     , column5
FROM cte1
JOIN cte2 ON cte1.column1 = cte2.column4
WHERE cte1.column2 = 'value4'
  AND cte2.column5 = 'value5';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
