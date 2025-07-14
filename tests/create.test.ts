import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("CREATE", () => {
    test("formats a simple create statement", async () => {
        const unformatted = `CREATE TABLE users (id INT PRIMARY KEY comment 'User ID', name VARCHAR(100) not null, email VARCHAR(100), status VARCHAR(20), last_updated datetime default current_timestamp());`;

        const expected = `CREATE TABLE users (
      id INT PRIMARY KEY COMMENT 'User ID'
    , name VARCHAR(100) NOT NULL
    , email VARCHAR(100)
    , status VARCHAR(20)
    , last_updated DATETIME DEFAULT CURRENT_TIMESTAMP()
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats a create statement with foreign keys", async () => {
        const unformatted = `CREATE TABLE orders (id INT PRIMARY KEY, user_id int REFERENCES users(id), order_date DATETIME, total DECIMAL(10,2));`;

        const expected = `CREATE TABLE orders (
      id INT PRIMARY KEY
    , user_id INT REFERENCES users(id)
    , order_date DATETIME
    , total DECIMAL(10,2)
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats a create or replace statement", async () => {
        const unformatted = `CREATE OR REPLACE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id), order_date DATETIME, total DECIMAL(10,2));`;
        const expected = `CREATE OR REPLACE TABLE orders (
      id INT PRIMARY KEY
    , user_id INT REFERENCES users(id)
    , order_date DATETIME
    , total DECIMAL(10,2)
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("simple view creation", async () => {
        const unformatted = `CREATE VIEW active_users AS SELECT id, name FROM users WHERE status = 'active';`;

        const expected = `CREATE VIEW active_users AS
SELECT id
     , name
FROM users
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Create or replace view", async () => {
        const unformatted = `CREATE OR REPLACE VIEW active_users AS SELECT id, name FROM users WHERE status = 'active';`;

        const expected = `CREATE OR REPLACE VIEW active_users AS
SELECT id
     , name
FROM users
WHERE status = 'active'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("View with CTEs creation", async () => {
        const unformatted = `CREATE VIEW user_orders AS WITH recent_orders AS (SELECT * FROM orders WHERE order_date > '2025-01-01') SELECT u.id, u.name, ro.total FROM users u JOIN recent_orders ro ON u.id = ro.user_id;`;

        const expected = `CREATE VIEW user_orders AS
WITH recent_orders AS (
    SELECT *
    FROM orders
    WHERE order_date > '2025-01-01'
)
SELECT u.id
     , u.name
     , ro.total
FROM users u
JOIN recent_orders ro ON u.id = ro.user_id
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Create a schema", async () => {
        const unformatted = `create schema my_schema;`;
        const expected = `CREATE SCHEMA my_schema;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Complex view with ctes, ranking, splits", async () => {
        const unformatted = `CREATE OR REPLACE VIEW eliteprospects.venue AS
SELECT t.arena_id AS venue_id_eliteprospects, t.arena_name AS venue_name, SPLIT(c.city, ',')[0] as city, t.country_id as country_abbr, t.country_name as country, MAX(last_updated) AS last_updated
FROM eliteprospects.team t
WHERE c.city IS NOT NULL
GROUP BY 1,2,3,4,5
ORDER BY t.arena_id
;`;

        const expected = `CREATE OR REPLACE VIEW eliteprospects.venue AS
SELECT t.arena_id AS venue_id_eliteprospects
     , t.arena_name AS venue_name
     , SPLIT(c.city, ',')[0] AS city
     , t.country_id AS country_abbr
     , t.country_name AS country
     , MAX(last_updated) AS last_updated
FROM eliteprospects.team t
WHERE c.city IS NOT NULL
GROUP BY 1, 2, 3, 4, 5
ORDER BY t.arena_id
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
