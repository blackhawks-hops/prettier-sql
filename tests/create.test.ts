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

    test.skip("View with CTEs creation", async () => {
        const unformatted = `CREATE VIEW user_orders AS WITH recent_orders AS (SELECT * FROM orders WHERE order_date > NOW() - INTERVAL '30 days') SELECT u.id, u.name, ro.total FROM users u JOIN recent_orders ro ON u.id = ro.user_id;`;

        const expected = `CREATE VIEW user_orders AS
WITH recent_orders AS (
    SELECT *
    FROM orders
    WHERE order_date > NOW() - INTERVAL '30 days'
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
});
