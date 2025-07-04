# prettier-sql
Prettier plugin for VERY opinionated SQL file and snippet formatting

## Installation

```bash
npm install --save-dev prettier-sql
```

## Usage

### Configuration

Add the plugin to your Prettier configuration:

```js
// .prettierrc.js
module.exports = {
  plugins: [require('prettier-sql')],
  overrides: [
    {
      files: '*.sql',
      options: {
        parser: 'sql'
      }
    },
    {
      files: ['*.js', '*.ts'],
      options: {
        // For JavaScript files
        // Use 'typescript-sql' for TypeScript files
        parser: 'babel-sql'
      }
    }
  ]
};
```

### SQL Files

This plugin will automatically format `.sql` files according to the opinionated style rules.

### Template Literals

In JavaScript/TypeScript files, use the `sql` tag to format SQL template literals:

```javascript
import { sql } from 'prettier-sql/tag';

const query = sql`
  SELECT id, name, email
  FROM users
  WHERE status = 'active'
`;
```

After formatting, this will become:

```javascript
import { sql } from 'prettier-sql/tag';

const query = sql`
SELECT id
     , name
     , email
FROM users
WHERE status = 'active'
`;
```


## Example
Here is an example of how this plugin will format
- commas go at the beginning of each column name, and are lined up below the `T` in the `SELECT`
- column names are all lower case and on their own lines
- function names are all uppercase
- CTEs are indented
- GROUP BY columns are all on one line
- JOIN clauses are all on one line
- additional WHERE clauses move to a new line, indented to line up with the end of the WHERE

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
