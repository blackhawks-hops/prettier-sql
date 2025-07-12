import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("Combination of several types together", () => {
    test("Create schema, grant permissions, create a table", async () => {
        const unformatted = `create schema foo;grant all on schema foo to role bar;create table foo.bar (id int);`;
        const expected = `CREATE SCHEMA foo;

GRANT ALL ON SCHEMA foo TO ROLE bar;

CREATE TABLE foo.bar (
      id INT
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
    test("Real world full schema create", async () => {
        const unformatted = `create schema ahl;

-- Admin grants
GRANT CREATE TABLE, USAGE, MONITOR ON SCHEMA ahl TO ROLE ACCOUNTADMIN;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE TABLES IN SCHEMA ahl TO ROLE ACCOUNTADMIN;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE VIEWS IN SCHEMA ahl TO ROLE ACCOUNTADMIN;

-- Data scientist grants
GRANT USAGE, MONITOR ON SCHEMA ahl TO ROLE DATASCIENTIST;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE TABLES IN SCHEMA ahl TO ROLE DATASCIENTIST;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE VIEWS IN SCHEMA ahl TO ROLE DATASCIENTIST;

-- Reader grants
GRANT USAGE ON SCHEMA ahl TO ROLE READERS;
GRANT SELECT ON FUTURE TABLES IN SCHEMA ahl TO ROLE READERS;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA ahl TO ROLE READERS;

CREATE OR REPLACE TABLE ahl.contract (
team_id_hawks int NOT NULL
, team_name varchar(100)
, contract varchar(10)
, last_name varchar(50)
, first_name varchar(50)
, dob DATE
, hash varchar(32)
, last_updated DATETIME DEFAULT CURRENT_TIMESTAMP()
);
CREATE OR REPLACE TABLE ahl.contract_manual (
team_id_hawks int NOT NULL
, team_name varchar(100)
, contract varchar(10)
, last_name varchar(50)
, first_name varchar(50)
, player_id_hawks int
, last_updated DATETIME DEFAULT CURRENT_TIMESTAMP()
);`;

        const expected = `CREATE SCHEMA ahl;

-- Admin grants
GRANT CREATE TABLE, USAGE, MONITOR ON SCHEMA ahl TO ROLE ACCOUNTADMIN;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE TABLES IN SCHEMA ahl TO ROLE ACCOUNTADMIN;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE VIEWS IN SCHEMA ahl TO ROLE ACCOUNTADMIN;

-- Data scientist grants
GRANT USAGE, MONITOR ON SCHEMA ahl TO ROLE DATASCIENTIST;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE TABLES IN SCHEMA ahl TO ROLE DATASCIENTIST;
GRANT DELETE, INSERT, REBUILD, REFERENCES, SELECT, TRUNCATE, UPDATE ON FUTURE VIEWS IN SCHEMA ahl TO ROLE DATASCIENTIST;

-- Reader grants
GRANT USAGE ON SCHEMA ahl TO ROLE READERS;
GRANT SELECT ON FUTURE TABLES IN SCHEMA ahl TO ROLE READERS;
GRANT SELECT ON FUTURE VIEWS IN SCHEMA ahl TO ROLE READERS;

CREATE OR REPLACE TABLE ahl.contract (
      team_id_hawks INT NOT NULL
    , team_name VARCHAR(100)
    , contract VARCHAR(10)
    , last_name VARCHAR(50)
    , first_name VARCHAR(50)
    , dob DATE
    , hash VARCHAR(32)
    , last_updated DATETIME DEFAULT CURRENT_TIMESTAMP()
)
;

CREATE OR REPLACE TABLE ahl.contract_manual (
      team_id_hawks INT NOT NULL
    , team_name VARCHAR(100)
    , contract VARCHAR(10)
    , last_name VARCHAR(50)
    , first_name VARCHAR(50)
    , player_id_hawks INT
    , last_updated DATETIME DEFAULT CURRENT_TIMESTAMP()
)
;
`;
        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected.trim());
    });
});
