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
        const unformatted = `CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100), email VARCHAR(100), status VARCHAR(20));`;

        const expected = `CREATE TABLE users (
      id INT PRIMARY KEY
    , name VARCHAR(100)
    , email VARCHAR(100)
    , status VARCHAR(20)
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
});
