import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    parser: "sql",
};

describe("SQL Formatter", () => {
    test("formats a simple SELECT statement", async () => {
        const unformatted = `
      select id, name, email from users where status = 'active';
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
      select id, first_name, last_name, email, phone, address, city, state, zip_code
      from customers
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
      join orders o on u.id = o.user_id
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

    test("Aliases", async () => {
        const unformatted = `
      SELECT u.id AS user_id, u.name AS user_name, o.total AS order_total
      FROM users u
      JOIN orders o ON u.id = o.user_id
      WHERE u.status = 'active';
    `;

        const expected = `SELECT u.id AS user_id
     , u.name AS user_name
     , o.total AS order_total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("understands function", async () => {
        const unformatted = `select count(*) as total_users, avg(coalesce(age, 20)) as average_age from users where status = 'active';`;
        const expected = `SELECT COUNT(*) AS total_users
     , AVG(age) AS average_age
FROM users
WHERE status = 'active';`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("formats CTEs", async () => {
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
         , COUNT(*) as order_count
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
});
