import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("SELECT", () => {
    test("formats a simple SELECT statement", async () => {
        const unformatted = `
      select id, name, email from users where status = 'active';
    `;

        const expected = `SELECT id
     , name
     , email
FROM users
WHERE status = 'active'
;`;

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
  AND country = 'USA'
;`;

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
WHERE u.status = 'active'
;`;

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
  AND manufacturer = 'Apple'
;`;

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
WHERE u.status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("understands function", async () => {
        const unformatted = `select count(*) as total_users, avg(coalesce(age, 20)) as average_age from users where status = 'active';`;
        const expected = `SELECT COUNT(*) AS total_users
     , AVG(COALESCE(age, 20)) AS average_age
FROM users
WHERE status = 'active'
;`;

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
         , COUNT(*) AS order_count
    FROM orders
    WHERE created_at > '2023-01-01'
    GROUP BY user_id
)
SELECT u.id
     , u.name
     , u.email
     , COALESCE(o.order_count, 0) AS order_count
FROM active_users u
LEFT JOIN recent_orders o ON u.id = o.user_id
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Multiple queries in one string", async () => {
        const unformatted = `
      SELECT id, name FROM users WHERE status = 'active';
      SELECT id, total FROM orders WHERE status = 'completed';
    `;

        const expected = `SELECT id
     , name
FROM users
WHERE status = 'active'
;

SELECT id
     , total
FROM orders
WHERE status = 'completed'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Simple query with USING shorthand", async () => {
        const unformatted = `
      SELECT u.id, u.name, o.total
      FROM users u
      JOIN orders o USING (user_id)
      WHERE u.status = 'active';
    `;

        const expected = `SELECT u.id
     , u.name
     , o.total
FROM users u
JOIN orders o USING(user_id)
WHERE u.status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Casting types in SELECT", async () => {
        const unformatted = `
      SELECT id, name, created_at::DATE AS created_date
      FROM users
      WHERE status = 'active';
    `;

        const expected = `SELECT id
     , name
     , created_at::DATE AS created_date
FROM users
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("RANK and ROW_NUMBER functions", async () => {
        const unformatted = `
      SELECT id, name, RANK() OVER (ORDER BY created_at DESC) AS ranky
      FROM users
      WHERE status = 'active';
    `;

        const expected = `SELECT id
     , name
     , RANK() OVER (ORDER BY created_at DESC) AS ranky
FROM users
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("More complex partitioning", async () => {
        const unformatted = `
      SELECT id, name, RANK() OVER (PARTITION BY country ORDER BY created_at DESC, name) AS ranky
      FROM users
      WHERE status = 'active';
    `;

        const expected = `SELECT id
     , name
     , RANK() OVER (PARTITION BY country ORDER BY created_at DESC, name) AS ranky
FROM users
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Subquery", async () => {
        const unformatted = `SELECT u.id, u.name from users u join  (SELECT id, name FROM orders) o USING(id)
      WHERE status = 'active';
    `;

        const expected = `SELECT u.id
     , u.name
FROM users u
JOIN (
    SELECT id
         , name
    FROM orders
) o USING(id)
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Splits", async () => {
        const unformatted = `
      SELECT id, split(name, ',')[0] as name_last, email
      FROM users
      WHERE status = 'active' AND split(name, ',')[0] = 'Smith'
      ORDER BY created_at DESC
      LIMIT 10;
    `;

        const expected = `SELECT id
     , SPLIT(name, ',')[0] AS name_last
     , email
FROM users
WHERE status = 'active'
  AND SPLIT(name, ',')[0] = 'Smith'
ORDER BY created_at DESC
LIMIT 10
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("NOT NULL checks", async () => {
        const unformatted = `
      SELECT id, name, email
      FROM users
      WHERE status = 'active' AND email IS NOT NULL;
    `;

        const expected = `SELECT id
     , name
     , email
FROM users
WHERE status = 'active'
  AND email IS NOT NULL
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Distinct agg", async () => {
        const unformatted = `select count(distinct email) as unique_emails from users where status = 'active';
    `;

        const expected = `SELECT COUNT(DISTINCT email) AS unique_emails
FROM users
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Join with split", async () => {
        const unformatted = `
      select u.id, u.name, o.order_id
      from users u
      join orders o on u.name_last = split(o.name, ',')[0]
    `;

        const expected = `SELECT u.id
     , u.name
     , o.order_id
FROM users u
JOIN orders o ON u.name_last = SPLIT(o.name, ',')[0]
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Subquery in a CTE", async () => {
        const unformatted = `CREATE OR REPLACE VIEW madhouse.list AS
WITH latest_version AS (
    SELECT list_id, list_version_id FROM (
        SELECT list_id
             , list_version_id
             , ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY last_updated DESC) AS version_number
        FROM madhouse.list_history
    )
    WHERE version_number = 1
)
SELECT lh.*
FROM madhouse.list_history lh
JOIN latest_version lv USING(list_id, list_version_id)
;`;

        const expected = `CREATE OR REPLACE VIEW madhouse.list AS
WITH latest_version AS (
    SELECT list_id
         , list_version_id
    FROM (
        SELECT list_id
             , list_version_id
             , ROW_NUMBER() OVER (PARTITION BY list_id ORDER BY last_updated DESC) AS version_number
        FROM madhouse.list_history
    )
    WHERE version_number = 1
)
SELECT lh.*
FROM madhouse.list_history lh
JOIN latest_version lv USING(list_id, list_version_id)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("Boolean gates in WHERE clause", async () => {
        const unformatted = `
      SELECT id, name, email
      FROM users
      WHERE status = 'active' AND (is_verified = true OR is_premium = true);
    `;

        const expected = `SELECT id
     , name
     , email
FROM users
WHERE status = 'active'
  AND (is_verified = true OR is_premium = true)
;`;
        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("Block multiline comments", async () => {
        const unformatted = `
      SELECT id, name, email
      FROM users
      /* This is a comment
         that spans multiple lines */
      WHERE status = 'active';
    `;

        const expected = `SELECT id
     , name
     , email
FROM users
/* This is a comment
   that spans multiple lines */
WHERE status = 'active'
;`;
        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("Unions", async () => {
        const unformatted = `
      SELECT id, name FROM users WHERE status = 'active'
      UNION
      SELECT id, name FROM customers WHERE status = 'active';
    `;

        const expected = `SELECT id
     , name
FROM users
WHERE status = 'active'
UNION
SELECT id
     , name
FROM customers
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
