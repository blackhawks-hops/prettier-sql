import prettier from "prettier";
import { describe, test, expect } from "vitest";
import * as sqlPlugin from "../src";

// Register the plugin with Prettier
const options = {
    plugins: [sqlPlugin],
    tabWidth: 4,
    parser: "sql",
};

describe("UPDATE", () => {
    test("Simple update", async () => {
        const unformatted = `
      update public.player set birthday = current_date, last_updated = current_timestamp where id > 1000;
    `;

        const expected = `UPDATE public.player
   SET birthday = CURRENT_DATE
     , last_updated = CURRENT_TIMESTAMP
WHERE id > 1000
;`;

        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });

    test("Update from subquery", async () => {
        const unformatted = `
      update public.player set birthday = current_date, last_updated = current_timestamp where id in (select id from public.player where id > 1000);
    `;

        const expected = `UPDATE public.player
   SET birthday = CURRENT_DATE
     , last_updated = CURRENT_TIMESTAMP
WHERE id IN (
    SELECT id
    FROM public.player
    WHERE id > 1000
)
;`;
        const formatted = await prettier.format(unformatted, options);
        expect(formatted.trim()).toBe(expected);
    });
});
