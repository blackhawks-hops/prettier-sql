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
      id           INT PRIMARY KEY COMMENT 'User ID'
    , name         VARCHAR(100) NOT NULL
    , email        VARCHAR(100)
    , status       VARCHAR(20)
    , last_updated DATETIME DEFAULT CURRENT_TIMESTAMP()
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats a create statement with foreign keys", async () => {
        const unformatted = `CREATE TABLE orders (id INT PRIMARY KEY, user_id int REFERENCES users(id), order_date DATETIME, total DECIMAL(10,2));`;

        const expected = `CREATE TABLE orders (
      id         INT PRIMARY KEY
    , user_id    INT REFERENCES users(id)
    , order_date DATETIME
    , total      DECIMAL(10,2)
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("formats a create or replace statement", async () => {
        const unformatted = `CREATE OR REPLACE TABLE orders (id INT PRIMARY KEY, user_id INT REFERENCES users(id), order_date DATETIME, total DECIMAL(10,2));`;
        const expected = `CREATE OR REPLACE TABLE orders (
      id         INT PRIMARY KEY
    , user_id    INT REFERENCES users(id)
    , order_date DATETIME
    , total      DECIMAL(10,2)
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
WITH arena_city AS (
    SELECT arena_id
         , arena_name
         , SPLIT(city, ',')[0] AS city
         , team_id_eliteprospects
    FROM eliteprospects.team
    WHERE arena_id IS NOT NULL
      AND city IS NOT NULL
    GROUP BY arena_id, arena_name, city, team_id_eliteprospects
    ORDER BY arena_id, city
)
, city_rank AS (
    SELECT arena_id
         , arena_name
         , city
         , ROW_NUMBER() OVER (PARTITION BY arena_id, arena_name ORDER BY COUNT(DISTINCT team_id_eliteprospects) DESC) AS team_id_rank
         , COUNT(DISTINCT team_id_eliteprospects) AS team_count
    FROM arena_city
    GROUP BY arena_id, arena_name, city
    ORDER BY arena_id, team_id_rank
)
SELECT t.arena_id AS venue_id_eliteprospects
     , t.arena_name AS venue_name
     , c.city::varchar AS city
     , t.country_id AS country_abbr
     , t.country_name AS country
     , MAX(last_updated) AS last_updated
FROM eliteprospects.team t
JOIN city_rank c ON t.arena_id = c.arena_id AND SPLIT(t.city, ',')[0] = c.city
WHERE c.team_id_rank = 1
GROUP BY 1,2,3,4,5
ORDER BY t.arena_id
;`;

        const expected = `CREATE OR REPLACE VIEW eliteprospects.venue AS
WITH arena_city AS (
    SELECT arena_id
         , arena_name
         , SPLIT(city, ',')[0] AS city
         , team_id_eliteprospects
    FROM eliteprospects.team
    WHERE arena_id IS NOT NULL
      AND city IS NOT NULL
    GROUP BY arena_id, arena_name, city, team_id_eliteprospects
    ORDER BY arena_id, city
)
, city_rank AS (
    SELECT arena_id
         , arena_name
         , city
         , ROW_NUMBER() OVER (PARTITION BY arena_id, arena_name ORDER BY COUNT(DISTINCT team_id_eliteprospects) DESC) AS team_id_rank
         , COUNT(DISTINCT team_id_eliteprospects) AS team_count
    FROM arena_city
    GROUP BY arena_id, arena_name, city
    ORDER BY arena_id, team_id_rank
)
SELECT t.arena_id AS venue_id_eliteprospects
     , t.arena_name AS venue_name
     , c.city::VARCHAR AS city
     , t.country_id AS country_abbr
     , t.country_name AS country
     , MAX(last_updated) AS last_updated
FROM eliteprospects.team t
JOIN city_rank c ON t.arena_id = c.arena_id AND SPLIT(t.city, ',')[0] = c.city
WHERE c.team_id_rank = 1
GROUP BY 1, 2, 3, 4, 5
ORDER BY t.arena_id
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("OBJECT and ARRAY types", async () => {
        const unformatted = `CREATE TABLE my_table (id INT PRIMARY KEY, data OBJECT, tags ARRAY);`;
        const expected = `CREATE TABLE my_table (
      id   INT PRIMARY KEY
    , data OBJECT
    , tags ARRAY
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("More custom types", async () => {
        const unformatted = `CREATE TABLE my_table (id REAL, metadata JSON, settings STRING, another_one VARIANT);`;
        const expected = `CREATE TABLE my_table (
      id          REAL
    , metadata    JSON
    , settings    STRING
    , another_one VARIANT
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Default booleans", async () => {
        const unformatted = `CREATE TABLE my_table (id INT PRIMARY KEY, is_active BOOLEAN DEFAULT TRUE, is_verified BOOLEAN DEFAULT FALSE);`;
        const expected = `CREATE TABLE my_table (
      id          INT PRIMARY KEY
    , is_active   BOOLEAN DEFAULT TRUE
    , is_verified BOOLEAN DEFAULT FALSE
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Inline comments", async () => {
        const unformatted = `CREATE TABLE my_table (id INT PRIMARY KEY, name VARCHAR(100) -- full name);`;
        const expected = `CREATE TABLE my_table (
      id   INT PRIMARY KEY
    , name VARCHAR(100) -- full name
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Comment on table", async () => {
        const unformatted = `CREATE TABLE my_table (id INT PRIMARY KEY, name VARCHAR(100)) COMMENT 'This is a sample table';`;
        const expected = `CREATE TABLE my_table (
      id   INT PRIMARY KEY
    , name VARCHAR(100)
)
COMMENT 'This is a sample table'
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("create with compound primary key", async () => {
        const unformatted = `CREATE OR REPLACE TABLE HAWKS.THING (
SEASON NUMBER(8,0) NOT NULL,
LEAGUE_ID_HAWKS NUMBER(38,0) NOT NULL,
MANPOWER_CODE NUMBER(4,0) NOT NULL,
ZONE VARCHAR(2) NOT NULL,
AREA_NAME VARCHAR(50) NOT NULL,
IS_RUSH BOOLEAN NOT NULL,
POSSESSION_VALUE FLOAT,
GAME_TYPE VARCHAR(1),
last_updated TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
primary key (SEASON, LEAGUE_ID_HAWKS, MANPOWER_CODE, ZONE, AREA_NAME, IS_RUSH)
);`;

        const expected = `CREATE OR REPLACE TABLE hawks.thing (
      season           NUMBER(8,0) NOT NULL
    , league_id_hawks  NUMBER(38,0) NOT NULL
    , manpower_code    NUMBER(4,0) NOT NULL
    , zone             VARCHAR(2) NOT NULL
    , area_name        VARCHAR(50) NOT NULL
    , is_rush          BOOLEAN NOT NULL
    , possession_value FLOAT
    , game_type        VARCHAR(1)
    , last_updated     TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP()
    , PRIMARY KEY (season, league_id_hawks, manpower_code, zone, area_name, is_rush)
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
