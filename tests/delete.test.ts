import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("DELETE", () => {
    test.skip("Simple delete", async () => {
        const unformatted = `delete from public.user where id = 1;`;

        const expected = `DELETE FROM public.user
WHERE id = 1
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("Delete using another table", async () => {
        const unformatted = `delete from public.user where id in (select id from temp_users);`;
        const expected = `DELETE FROM public.user
WHERE id IN (
    SELECT id
    FROM temp_users
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("Delete with a CTE", async () => {
        const unformatted = `delete from public.user using (with temp_users as (select id from users) select id from temp_users) as tu where public.user.id = tu.id;`;
        const expected = `DELETE FROM public.user
USING (
    WITH temp_users AS (
        SELECT id
        FROM users
    )
    SELECT id
    FROM temp_users
) AS tu
WHERE public.user.id = tu.id
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test.skip("Delete where exists", async () => {
        const unformatted = `delete from public.user where exists (select 1 from temp_users where temp_users.id = public.user.id);`;
        const expected = `DELETE FROM public.user
WHERE EXISTS (
    SELECT 1
    FROM temp_users
    WHERE temp_users.id = public.user.id
)
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
