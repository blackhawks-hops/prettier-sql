import prettier from 'prettier';
import * as sqlPlugin from '../src';

// Register the plugin with Prettier for JavaScript
const jsOptions = {
  plugins: [sqlPlugin],
  parser: 'babel-sql',
};

// Register the plugin with Prettier for TypeScript
const tsOptions = {
  plugins: [sqlPlugin],
  parser: 'typescript-sql',
};

describe('SQL Template Literal Formatting', () => {
  test('formats SQL in JavaScript template literals', async () => {
    const unformatted = `
const query = sql\`
  SELECT id, name, email FROM users
  WHERE status = 'active'
  AND created_at > '2023-01-01'
\`;
    `;
    
    const expected = `const query = sql\`
SELECT id
     , name
     , email
FROM users
WHERE status = 'active'
  AND created_at > '2023-01-01'
\`;
`;
    
    const formatted = await prettier.format(unformatted, jsOptions);
    expect(formatted).toBe(expected);
  });
  
  test('formats SQL in TypeScript template literals', async () => {
    const unformatted = `
const getUsersQuery = (status: string, date: string): string => sql\`
  SELECT id, name, email, created_at
  FROM users
  WHERE status = \${status}
  AND created_at > \${date}
\`;
    `;
    
    const expected = `const getUsersQuery = (status: string, date: string): string => sql\`
SELECT id
     , name
     , email
     , created_at
FROM users
WHERE status = \${status}
  AND created_at > \${date}
\`;
`;
    
    const formatted = await prettier.format(unformatted, tsOptions);
    expect(formatted).toBe(expected);
  });
  
  test('formats complex SQL in template literals', async () => {
    const unformatted = `
const complexQuery = sql\`
  WITH active_users AS (SELECT id, name, email FROM users WHERE status = 'active'),
  recent_orders AS (SELECT user_id, COUNT(*) as order_count FROM orders WHERE created_at > '2023-01-01' GROUP BY user_id)
  SELECT u.id, u.name, u.email, COALESCE(o.order_count, 0) as order_count
  FROM active_users u
  LEFT JOIN recent_orders o ON u.id = o.user_id
\`;
    `;
    
    const expected = `const complexQuery = sql\`
WITH active_users AS (
    SELECT id
         , name
         , email
    FROM users
    WHERE status = 'active'
)
, recent_orders AS (
    SELECT user_id
         , count(*) as order_count
    FROM orders
    WHERE created_at > '2023-01-01'
)
SELECT u.id
     , u.name
     , u.email
     , COALESCE(o.order_count, 0) as order_count
FROM active_users u
LEFT JOIN recent_orders o ON u.id = o.user_id
\`;
`;
    
    const formatted = await prettier.format(unformatted, jsOptions);
    expect(formatted).toBe(expected);
  });
  
  test('leaves regular template literals unchanged', async () => {
    const unformatted = `
const regularTemplate = \`
  This is a regular template literal
  It should not be formatted as SQL
\`;
    `;
    
    const expected = `const regularTemplate = \`
  This is a regular template literal
  It should not be formatted as SQL
\`;
`;
    
    const formatted = await prettier.format(unformatted, jsOptions);
    expect(formatted).toBe(expected);
  });
  
  test('formats SQL template literals within complex code', async () => {
    const unformatted = `
function fetchUsers() {
  const status = 'active';
  const date = '2023-01-01';
  
  const query = sql\`
    SELECT id, name, email
    FROM users
    WHERE status = \${status}
    AND created_at > \${date}
  \`;
  
  return executeQuery(query);
}
    `;
    
    const expected = `function fetchUsers() {
  const status = "active";
  const date = "2023-01-01";

  const query = sql\`
SELECT id
     , name
     , email
FROM users
WHERE status = \${status}
  AND created_at > \${date}\`;

  return executeQuery(query);
}
`;
    
    const formatted = await prettier.format(unformatted, jsOptions);
    expect(formatted).toBe(expected);
  });
});