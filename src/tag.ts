/**
 * SQL template literal tag function
 *
 * This function is used to mark SQL template literals for formatting by the prettier plugin.
 * It's a no-op at runtime - it just returns the template string as-is.
 */
export function sql(strings: TemplateStringsArray, ...values: any[]): string {
  let result = strings[0];

  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + strings[i + 1];
  }

  return result;
}
