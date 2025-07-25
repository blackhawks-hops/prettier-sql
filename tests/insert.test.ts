import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("INSERT", () => {
    test("Simple blind insert", async () => {
        const unformatted = `insert into public.users select * from temp_users;`;

        const expected = `INSERT INTO public.users
SELECT *
FROM temp_users
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Insert with specific columns", async () => {
        const unformatted = `insert into public.users (id, name) select id, name from temp_users;`;
        const expected = `INSERT INTO public.users (id, name)
SELECT id
     , name
FROM temp_users
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Insert with a CTE", async () => {
        const unformatted = `insert into public.users (id, name) with temp_users as (select id, name from users) select id, name from temp_users;`;
        const expected = `INSERT INTO public.users (
      id
    , name
)
WITH temp_users AS (
    SELECT id
         , name
    FROM users
)
SELECT id
     , name
FROM temp_users
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
