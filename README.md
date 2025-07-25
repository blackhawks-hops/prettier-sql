# @blackhawks-hops/prettier-sql

Prettier plugin for VERY opinionated SQL file and snippet formatting

[![Build and Test](https://github.com/blackhawks-hops/prettier-sql/actions/workflows/test.yml/badge.svg)](https://github.com/blackhawks-hops/prettier-sql/actions/workflows/test.yml)

## Installation

```bash
npm install --save-dev @blackhawks-hops/prettier-sql
```

## Publishing

To publish this package to npm manually, follow these steps:

1. Make sure you have an npm account and are part of the `blackhawks-hops` organization
2. Login to npm:

```bash
npm login
```

3. Build and publish the package:

```bash
npm run build
npm publish
```

The package includes the `publishConfig` setting with `"access": "public"` to ensure it can be published as a public scoped package.

## Usage

### Configuration

Add the plugin to your Prettier configuration:

```js
// .prettierrc.js
module.exports = {
    plugins: [require("@blackhawks-hops/prettier-sql")],
    overrides: [
        {
            files: "*.sql",
            options: {
                parser: "sql",
            },
        }
    ],
};
```

### SQL Files

This plugin will automatically format `.sql` files according to the opinionated style rules.

## Example

Here is an example of how this plugin will format

-   commas go at the beginning of each column name, and are lined up below the `T` in the `SELECT`
-   column names are all lower case and on their own lines
-   function names are all uppercase
-   CTEs are indented
-   GROUP BY columns are all on one line
-   JOIN clauses are all on one line
-   additional WHERE clauses move to a new line, indented to line up with the end of the WHERE

```sql
WITH cte1 AS (
    SELECT column1
         , column2
         , column3
    FROM table1
    WHERE column1 = 'value1'
      AND column2 = 'value2'
)
, cte2 AS (
    SELECT column4
         , column5
    FROM table2
    WHERE column4 = 'value3'
)
SELECT column1
     , column2
     , column3
     , column4
     , column5
FROM cte1
JOIN cte2 ON cte1.column1 = cte2.column4
WHERE cte1.column2 = 'value4'
  AND cte2.column5 = 'value5'
;
```
