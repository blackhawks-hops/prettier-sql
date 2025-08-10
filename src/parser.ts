import { Parser } from "node-sql-parser";
import { SQLNode } from "./types";

// Global storage for QUALIFY clauses that need to be restored
const qualifyStorage = new Map<string, string>();

export class SQLParser {
    private static parser = new Parser();

    /**
     * Check if the SQL statement is a GRANT statement
     */
    static isGrantStatement(sql: string): boolean {
        return /^\s*GRANT\s+/i.test(sql);
    }

    /**
     * Check if the SQL contains standalone comments before SQL statements
     */
    static hasStandaloneComments(sql: string): boolean {
        const lines = sql.split("\n");
        let foundComment = false;
        let foundSql = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("--") || trimmed.startsWith("/*")) {
                foundComment = true;
            } else if (trimmed && !trimmed.startsWith("--") && !trimmed.startsWith("/*")) {
                foundSql = true;
                break;
            }
        }

        return foundComment && foundSql;
    }

    /**
     * Separate standalone comments from SQL statements
     */
    static separateCommentsFromSQL(sql: string): { comments: string[]; sqlStatement: string } {
        const lines = sql.split("\n");
        const comments: string[] = [];
        const sqlLines: string[] = [];
        let inSqlSection = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (!inSqlSection && (trimmed.startsWith("--") || trimmed.startsWith("/*") || trimmed === "")) {
                comments.push(line);
            } else {
                inSqlSection = true;
                sqlLines.push(line);
            }
        }

        return {
            comments,
            sqlStatement: sqlLines.join("\n").trim(),
        };
    }

    /**
     * Split SQL into multiple statements
     */
    static splitStatements(sql: string): string[] {
        return sql
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0)
            .map((stmt) => stmt + ";");
    }

    /**
     * Check if the SQL contains multiple statements
     */
    static isMultipleStatements(sql: string): boolean {
        return this.splitStatements(sql).length > 1;
    }

    /**
     * Split multiple SQL statements and check if they are all GRANT statements
     */
    static isMultipleGrantStatements(sql: string): boolean {
        const statements = this.splitStatements(sql);
        return statements.length > 1 && statements.every((stmt) => this.isGrantStatement(stmt));
    }

    /**
     * Parse a GRANT statement into a custom AST structure
     */
    static parseGrantStatement(sql: string): any {
        // Enhanced regex pattern to handle multiple privileges separated by commas
        const grantRegex =
            /^\s*GRANT\s+([^ON]+)\s+ON\s+([^\s]+)\s+([^\s]+)(?:\s+IN\s+([^\s]+)\s+([^\s]+))?\s+TO\s+([^\s]+)\s+([^;]+);?\s*$/i;
        const match = sql.match(grantRegex);

        if (!match) {
            // Return a minimal structure for simple formatting
            return {
                type: "grant",
                statement: sql.trim(),
            };
        }

        // Extract structured data from the match
        const [, privilege, onType, onName, inType, inName, toType, toName] = match;

        return {
            type: "grant",
            privilege: privilege?.trim().toUpperCase(),
            on_type: onType?.toUpperCase(),
            on_name: onName,
            in_type: inType?.toUpperCase(),
            in_name: inName,
            to_type: toType?.toUpperCase(),
            to_name: toName.replace(/;$/, ""),
        };
    }

    /**
     * Preprocess SQL for custom column types
     * Returns an object with the processed text and the custom types for post-processing
     */
    static preprocessCustomTypes(sql: string): {
        processedText: string;
        customTypes: Array<{ original: string; placeholder: string; type: string }>;
    } {
        let processedText = sql;
        const customTypes: Array<{ original: string; placeholder: string; type: string }> = [];

        // Define patterns for recognizing custom types in column definitions
        // Looking for patterns like: columnName ARRAY, columnName OBJECT, columnName REAL, etc.
        // Also handle NUMBER with precision/scale like: columnName NUMBER(8,0)
        // Also handle TIMESTAMP_NTZ with precision like: columnName TIMESTAMP_NTZ(9)
        // Note: JSON is already supported by node-sql-parser, so we don't need to handle it here
        const customTypeRegex =
            /\b(\w+)\s+(ARRAY|OBJECT|REAL|STRING|VARIANT|NUMBER(?:\(\d+(?:,\d+)?\))?|TIMESTAMP_NTZ(?:\(\d+\))?)/gi;
        let match;

        while ((match = customTypeRegex.exec(sql)) !== null) {
            const original = match[0]; // e.g., "data OBJECT" or "tags ARRAY" or "season NUMBER(8,0)"
            const columnName = match[1]; // e.g., "data" or "tags" or "season"
            const typeName = match[2].toUpperCase(); // "ARRAY", "OBJECT", "REAL", "NUMBER(8,0)", etc.

            // Create a placeholder using a supported type as a temporary type
            // node-sql-parser supports these types, so we'll use them as placeholders
            let placeholderType = "VARCHAR";
            if (typeName === "REAL") {
                placeholderType = "FLOAT"; // REAL is similar to FLOAT
            } else if (typeName.startsWith("NUMBER")) {
                // Handle NUMBER types (with or without precision/scale) as DECIMAL
                if (typeName.includes("(")) {
                    // Extract precision and scale from NUMBER(p,s) and convert to DECIMAL(p,s)
                    const params = typeName.match(/NUMBER\((\d+(?:,\d+)?)\)/);
                    if (params) {
                        placeholderType = `DECIMAL(${params[1]})`;
                    } else {
                        placeholderType = "DECIMAL";
                    }
                } else {
                    placeholderType = "DECIMAL";
                }
            } else if (typeName.startsWith("TIMESTAMP_NTZ")) {
                // Handle TIMESTAMP_NTZ types as simple TIMESTAMP (no precision to avoid parser issues)
                placeholderType = "TIMESTAMP";
            }

            const placeholder = `${columnName} ${placeholderType}`;

            // Replace the original text with our placeholder
            processedText = processedText.replace(original, placeholder);

            // Store the mapping for post-processing
            customTypes.push({ original, placeholder, type: typeName });
        }

        return { processedText, customTypes };
    }

    /**
     * Preprocess SQL for inline comments
     * Returns an object with the processed text and the inline comments for post-processing
     */
    static preprocessInlineComments(sql: string): {
        processedText: string;
        inlineComments: Array<{ original: string; placeholder: string; comment: string }>;
    } {
        let processedText = sql;
        const inlineComments: Array<{ original: string; placeholder: string; comment: string }> = [];

        // Find inline comments (-- comment) but not at the start of a line
        // Match: word/identifier followed by whitespace and then -- comment (but stop at SQL terminators)
        const inlineCommentRegex = /(\w+(?:\([^)]*\))?)\s+(--[^;\r\n)]*)/g;
        let match;

        while ((match = inlineCommentRegex.exec(sql)) !== null) {
            const beforeComment = match[1];
            const comment = match[2];
            const original = match[0];

            // Create a placeholder to mark where the comment was
            const placeholder = `${beforeComment} /* INLINE_COMMENT_PLACEHOLDER_${inlineComments.length} */`;

            // Replace the original text with our placeholder
            processedText = processedText.replace(original, placeholder);

            // Store the mapping for post-processing
            inlineComments.push({ original, placeholder, comment });
        }

        return { processedText, inlineComments };
    }

    /**
     * Preprocess SQL for block comments
     * Returns an object with the processed text and the block comments for post-processing
     */
    static preprocessBlockComments(sql: string): {
        processedText: string;
        blockComments: Array<{ original: string; placeholder: string; comment: string }>;
    } {
        let processedText = sql;
        const blockComments: Array<{ original: string; placeholder: string; comment: string }> = [];

        // Find block comments (/* comment */)
        const blockCommentRegex = /\/\*[\s\S]*?\*\//g;
        let match;

        while ((match = blockCommentRegex.exec(sql)) !== null) {
            const comment = match[0];

            // Create a placeholder to mark where the comment was
            const placeholder = `/* BLOCK_COMMENT_PLACEHOLDER_${blockComments.length} */`;

            // Replace the original text with our placeholder
            processedText = processedText.replace(comment, placeholder);

            // Store the mapping for post-processing
            blockComments.push({ original: comment, placeholder, comment });
        }

        return { processedText, blockComments };
    }

    /**
     * Preprocess PostgreSQL-style casting (::type) for parsing
     * Converts expression::type to a parseable format with a special marker
     * The printer will convert it back to :: syntax
     */
    static preprocessPostgreSQLCasting(sql: string): {
        processedText: string;
        castings: Array<{ original: string; placeholder: string; expression: string; type: string }>;
    } {
        let result = sql;
        const castings: Array<{ original: string; placeholder: string; expression: string; type: string }> = [];

        // First, handle function calls with casting
        // This handles cases like "CONCAT(...)::TYPE" and "LEFT(...)::TYPE"
        const functionPattern =
            /\b(\w+\([^()]*(?:\([^()]*\)[^()]*)*\))::(INT|INTEGER|BIGINT|FLOAT|DOUBLE|DECIMAL|VARCHAR|TEXT|CHAR|BOOLEAN|BOOL|DATE|TIMESTAMP|TIME)\b/gi;

        result = result.replace(functionPattern, (match, functionCall, type) => {
            const replacement = `CAST(${functionCall} AS ${type})`;
            castings.push({
                original: match,
                placeholder: replacement,
                expression: functionCall,
                type: type,
            });
            return replacement;
        });

        // Then handle parenthesized expressions with casting (not function calls)
        // This handles cases like "(expression)::TYPE" and "(YEAR(...) || YEAR(...))::INT"
        const parenthesizedPattern =
            /(?<!\w)(\([^()]*(?:\([^()]*\)[^()]*)*\))::(INT|INTEGER|BIGINT|FLOAT|DOUBLE|DECIMAL|VARCHAR|TEXT|CHAR|BOOLEAN|BOOL|DATE|TIMESTAMP|TIME)\b/gi;

        result = result.replace(parenthesizedPattern, (match, expression, type) => {
            const replacement = `CAST(${expression} AS ${type})`;
            castings.push({
                original: match,
                placeholder: replacement,
                expression: expression,
                type: type,
            });
            return replacement;
        });

        // Third, handle simple identifiers with optional schema/table prefix
        // This handles cases like "is_win::INT", "column::int", "table.column::INT"
        const simplePattern =
            /\b((?:\w+\.)?\w+)::(INT|INTEGER|BIGINT|FLOAT|DOUBLE|DECIMAL|VARCHAR|TEXT|CHAR|BOOLEAN|BOOL|DATE|TIMESTAMP|TIME)\b/gi;

        result = result.replace(simplePattern, (match, identifier, type) => {
            const replacement = `CAST(${identifier} AS ${type})`;
            castings.push({
                original: match,
                placeholder: replacement,
                expression: identifier,
                type: type,
            });
            return replacement;
        });

        // Then fall back to complex algorithm for more complex cases
        let changed = true;

        while (changed) {
            changed = false;
            // Find :: followed by a type name
            const castMatch = result.match(/::\s*(\w+(?:\(\d+(?:,\d+)?\))?)/);
            if (castMatch) {
                const castStart = castMatch.index!;
                const type = castMatch[1];

                // Find the expression before :: by going backwards and matching parentheses
                let expressionStart = -1;
                let depth = 0;
                let foundMatchingParen = false;

                // Start from just before the ::
                let inQuotes = false;
                for (let i = castStart - 1; i >= 0; i--) {
                    const char = result[i];

                    // Track whether we're inside quotes
                    if (char === "'") {
                        inQuotes = !inQuotes;
                    }

                    if (!inQuotes) {
                        // Only process these characters when not inside quotes
                        if (char === ")") {
                            depth++;
                        } else if (char === "(") {
                            depth--;
                            if (depth === 0) {
                                // Found the matching opening parenthesis
                                foundMatchingParen = true;
                                // Continue looking backwards for the function name or other expression parts
                                // Look for word characters (function name) before the opening parenthesis
                                for (let j = i - 1; j >= 0; j--) {
                                    const prevChar = result[j];
                                    if (/[a-zA-Z_]/.test(prevChar)) {
                                        // Part of function name, continue
                                        continue;
                                    } else if (/\s|,|=|<|>|\+|\-|\*|\/|\(/.test(prevChar)) {
                                        // Found expression boundary
                                        expressionStart = j + 1;
                                        break;
                                    }

                                    if (j === 0) {
                                        expressionStart = 0;
                                        break;
                                    }
                                }
                                break;
                            }
                        } else if (depth === 0 && /\s|,|=|<|>|\+|\-|\*|\/|\(/.test(char)) {
                            // If we're not inside parentheses and hit an operator or boundary, stop
                            expressionStart = i + 1;
                            break;
                        }
                    }

                    if (i === 0) {
                        expressionStart = 0;
                        break;
                    }
                }

                // If we didn't find parentheses, look for expression boundaries including quoted strings
                if (!foundMatchingParen && expressionStart === -1) {
                    // Check if we're dealing with a quoted string literal
                    if (castStart > 0 && result[castStart - 1] === "'") {
                        // Find the start of the quoted string
                        for (let i = castStart - 2; i >= 0; i--) {
                            if (result[i] === "'") {
                                // Found the opening quote
                                expressionStart = i;
                                break;
                            }
                            if (i === 0) {
                                expressionStart = 0;
                                break;
                            }
                        }
                    } else {
                        // Look for the start of the expression (word/identifier boundary)
                        for (let i = castStart - 1; i >= 0; i--) {
                            const char = result[i];
                            if (/\s|,|=|<|>|\+|\-|\*|\/|\(/.test(char)) {
                                expressionStart = i + 1;
                                break;
                            }
                            if (i === 0) {
                                expressionStart = 0;
                                break;
                            }
                        }
                    }
                }

                if (expressionStart >= 0) {
                    const expression = result.substring(expressionStart, castStart).trim();
                    const castEnd = castStart + castMatch[0].length;
                    const original = result.substring(expressionStart, castEnd);

                    // Create a special placeholder that node-sql-parser can handle
                    // Use CAST() internally but mark it for conversion back to :: syntax
                    const placeholder = `CAST(${expression} AS ${type})`;

                    result = result.substring(0, expressionStart) + placeholder + result.substring(castEnd);

                    // Store the casting info for post-processing
                    castings.push({
                        original,
                        placeholder,
                        expression,
                        type,
                    });

                    changed = true;
                }
            }
        }

        return { processedText: result, castings };
    }

    /**
     * Preprocess SQL for QUALIFY clause (Snowflake/BigQuery extension)
     * QUALIFY is like WHERE but for window functions - not supported by node-sql-parser
     * This function also handles QUALIFY clauses inside CTEs
     */
    static preprocessQualify(sql: string): {
        processedText: string;
        qualifyClause: string | null;
        castings: Array<{ original: string; placeholder: string; expression: string; type: string }>;
    } {
        // First, handle PostgreSQL-style casting
        const { processedText: textAfterCasting, castings } = this.preprocessPostgreSQLCasting(sql);
        let processedText = textAfterCasting;

        // Then, handle QUALIFY clauses inside CTEs
        processedText = this.preprocessQualifyInCTEs(processedText);

        // Finally, handle top-level QUALIFY clause
        const topLevelResult = this.preprocessSingleQualify(processedText);

        return {
            processedText: topLevelResult.processedText,
            qualifyClause: topLevelResult.qualifyClause,
            castings,
        };
    }

    /**
     * Preprocess QUALIFY clauses inside CTE definitions
     */
    static preprocessQualifyInCTEs(sql: string): string {
        // Clear previous QUALIFY storage
        qualifyStorage.clear();

        // Use a more robust approach to find CTE patterns with proper parentheses matching
        const cteNamePattern = /(\w+)\s+AS\s*\(/gi;
        let result = sql;
        let match;

        // Reset the regex state
        cteNamePattern.lastIndex = 0;

        while ((match = cteNamePattern.exec(sql)) !== null) {
            const cteName = match[1]; // Extract the CTE name
            const cteStart = match[0];
            const startPos = match.index! + cteStart.length;

            // Find the matching closing parenthesis
            let depth = 1;
            let pos = startPos;
            let cteEnd = -1;

            while (pos < sql.length && depth > 0) {
                if (sql[pos] === "(") depth++;
                else if (sql[pos] === ")") depth--;

                if (depth === 0) {
                    cteEnd = pos;
                    break;
                }
                pos++;
            }

            if (cteEnd !== -1) {
                const cteContent = sql.substring(startPos, cteEnd);
                const processedCTE = this.preprocessSingleQualify(cteContent);

                if (processedCTE.qualifyClause) {
                    // Store the QUALIFY clause for later restoration
                    qualifyStorage.set(cteName, processedCTE.qualifyClause);

                    // Replace with just the processed content (no comment)
                    const fullReplacement = cteStart + processedCTE.processedText + ")";
                    const originalCTE = sql.substring(match.index!, cteEnd + 1);

                    result = result.replace(originalCTE, fullReplacement);
                }
            }
        }

        return result;
    }

    /**
     * Get stored QUALIFY clause for a CTE name
     */
    static getStoredQualify(cteName: string): string | undefined {
        return qualifyStorage.get(cteName);
    }

    /**
     * Get all stored QUALIFY clauses
     */
    static getAllStoredQualify(): Map<string, string> {
        return qualifyStorage;
    }

    /**
     * Preprocess a single QUALIFY clause
     */
    static preprocessSingleQualify(sql: string): {
        processedText: string;
        qualifyClause: string | null;
    } {
        let processedText = sql;
        let qualifyClause = null;

        // Match QUALIFY clause - need to handle nested parentheses properly
        // Look for QUALIFY followed by content until we hit ORDER BY/LIMIT/UNION that's not inside parentheses
        const qualifyMatch = sql.match(/\bQUALIFY\s+/i);
        if (!qualifyMatch) {
            return { processedText, qualifyClause };
        }

        const qualifyStart = qualifyMatch.index! + qualifyMatch[0].length;
        let currentPos = qualifyStart;
        let depth = 0;
        let qualifyEnd = -1;

        // Scan character by character to find the end of the QUALIFY clause
        while (currentPos < sql.length) {
            const char = sql[currentPos];
            const remaining = sql.substring(currentPos);

            if (char === "(") {
                depth++;
            } else if (char === ")") {
                depth--;
                // Check if we're closing the CTE/subquery
                if (depth < 0) {
                    qualifyEnd = currentPos;
                    break;
                }
            } else if (depth === 0) {
                // Only check for keywords when we're not inside parentheses
                if (remaining.match(/^\s*(?:ORDER\s+BY|LIMIT|UNION|;|\)|$)/i)) {
                    qualifyEnd = currentPos;
                    break;
                }
            }
            currentPos++;
        }

        if (qualifyEnd === -1) {
            qualifyEnd = sql.length;
        }

        const match = {
            0: sql.substring(qualifyMatch.index!, qualifyEnd),
            1: sql.substring(qualifyStart, qualifyEnd).trim(),
            index: qualifyMatch.index,
        };

        if (match) {
            qualifyClause = match[1].trim();
            // Remove the QUALIFY clause from the SQL to make it parseable
            processedText = processedText.replace(match[0], "");
            // Clean up any extra whitespace
            processedText = processedText.replace(/\s+/g, " ").trim();
        }

        return { processedText, qualifyClause };
    }

    /**
     * Preprocess SQL for "CREATE OR REPLACE TABLE/VIEW" Snowflake dialect
     * Returns an object with the processed text and the match result for post-processing
     */
    static preprocessCreateOrReplace(sql: string): {
        processedText: string;
        createOrReplaceMatch: RegExpExecArray | null;
    } {
        let processedText = sql;
        const createOrReplaceMatch = /CREATE\s+OR\s+REPLACE\s+(TABLE|VIEW)\s+/i.exec(sql);

        if (createOrReplaceMatch) {
            processedText = processedText.replace(
                createOrReplaceMatch[0],
                `CREATE ${createOrReplaceMatch[1].toUpperCase()} `,
            );
        }

        return { processedText, createOrReplaceMatch };
    }

    /**
     * Preprocess SQL to normalize decimal numbers that start with a dot
     * Converts .5 to 0.5, etc.
     */
    static preprocessDecimalNumbers(sql: string): string {
        // Only match decimal numbers that start with dot when preceded by operators or whitespace
        // But NOT when preceded by alphanumeric characters (which would be table.column)
        return sql.replace(/(?<=^|[\s\(\+\-\*\/\=\<\>\,\;\n\r])(\.\d+)/g, "0$1");
    }

    /**
     * Preprocess SQL for "CREATE DYNAMIC TABLE" Snowflake dialect
     * Returns an object with the processed text and the dynamic table info for post-processing
     */
    static preprocessCreateDynamicTable(sql: string): {
        processedText: string;
        dynamicTableMatch: {
            tableName: string;
            targetLag?: string;
            warehouse?: string;
            refreshMode?: string;
            initialize?: string;
        } | null;
    } {
        let processedText = sql;
        let dynamicTableMatch = null;

        // Match CREATE [OR REPLACE] DYNAMIC TABLE with flexible parameter order
        const dynamicTableStartRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?DYNAMIC\s+TABLE\s+([\w\.]+)/i;
        const startMatch = dynamicTableStartRegex.exec(sql);

        if (startMatch) {
            const tableName = startMatch[1];

            // Find the AS keyword to determine where parameters end
            const asIndex = sql.search(/\bAS\s+/i);
            if (asIndex === -1) return { processedText, dynamicTableMatch };

            // Extract the parameter section between table name and AS
            const parameterSection = sql.substring(startMatch.index + startMatch[0].length, asIndex).trim();

            // Extract TARGET_LAG parameter (optional)
            const targetLagMatch = /TARGET_LAG\s*=\s*'([^']+)'/i.exec(parameterSection);
            const targetLag = targetLagMatch ? targetLagMatch[1] : undefined;

            // Extract WAREHOUSE parameter (optional)
            const warehouseMatch = /WAREHOUSE\s*=\s*(\w+)/i.exec(parameterSection);
            const warehouse = warehouseMatch ? warehouseMatch[1] : undefined;

            // Extract REFRESH_MODE parameter (optional)
            const refreshModeMatch = /REFRESH_MODE\s*=\s*(\w+)/i.exec(parameterSection);
            const refreshMode = refreshModeMatch ? refreshModeMatch[1] : undefined;

            // Extract INITIALIZE parameter (optional)
            const initializeMatch = /INITIALIZE\s*=\s*(\w+)/i.exec(parameterSection);
            const initialize = initializeMatch ? initializeMatch[1] : undefined;

            dynamicTableMatch = {
                tableName,
                ...(targetLag && { targetLag }),
                ...(warehouse && { warehouse }),
                ...(refreshMode && { refreshMode }),
                ...(initialize && { initialize }),
            };

            // Find the complete match from CREATE [OR REPLACE] DYNAMIC TABLE to AS
            const fullMatchRegex = new RegExp(
                `CREATE\\s+(?:OR\\s+REPLACE\\s+)?DYNAMIC\\s+TABLE\\s+${tableName.replace(".", "\\.")}[\\s\\S]*?AS\\s+`,
                "i",
            );
            const fullMatch = fullMatchRegex.exec(sql);

            if (fullMatch) {
                // Replace with CREATE [OR REPLACE] VIEW that node-sql-parser can understand
                const hasOrReplace = /CREATE\s+OR\s+REPLACE/i.test(fullMatch[0]);
                const createPrefix = hasOrReplace ? "CREATE OR REPLACE VIEW" : "CREATE VIEW";
                processedText = processedText.replace(fullMatch[0], `${createPrefix} ${tableName} AS `);
            }
        }

        return { processedText, dynamicTableMatch };
    }

    /**
     * Preprocess SQL for "TABLE(GENERATOR())" Snowflake function
     * Returns an object with the processed text and the generator info for post-processing
     */
    static preprocessTableGenerator(sql: string): {
        processedText: string;
        tableGeneratorMatches: Array<{
            original: string;
            placeholder: string;
            parameters: { [key: string]: string };
        }>;
    } {
        let processedText = sql;
        const tableGeneratorMatches: Array<{
            original: string;
            placeholder: string;
            parameters: { [key: string]: string };
        }> = [];

        // Match TABLE(GENERATOR(...)) with various parameters
        const tableGeneratorRegex = /TABLE\(GENERATOR\(([^)]*)\)\)/gi;
        let match;
        let placeholderIndex = 0;

        while ((match = tableGeneratorRegex.exec(sql)) !== null) {
            const [fullMatch, parametersStr] = match;
            const parameters: { [key: string]: string } = {};

            // Parse parameters like "ROWCOUNT => 1000, TIMELIMIT => 60"
            const paramPairs = parametersStr.split(",");
            for (const pair of paramPairs) {
                const paramMatch = /\s*(\w+)\s*=>\s*([^,]+)/i.exec(pair.trim());
                if (paramMatch) {
                    const [, paramName, paramValue] = paramMatch;
                    parameters[paramName.toUpperCase()] = paramValue.trim();
                }
            }

            // Create a placeholder that node-sql-parser can understand
            const placeholder = `__TABLE_GENERATOR_${placeholderIndex}__`;

            // Replace with a simple table reference
            processedText = processedText.replace(fullMatch, placeholder);

            // Store the mapping for post-processing
            tableGeneratorMatches.push({
                original: fullMatch,
                placeholder,
                parameters,
            });

            placeholderIndex++;
        }

        return { processedText, tableGeneratorMatches };
    }

    /**
     * Preprocess SQL for DELETE with USING clause
     * Returns an object with the processed text and the using clause for post-processing
     */
    static preprocessDeleteUsing(sql: string): {
        processedText: string;
        usingClause: string | null;
    } {
        let processedText = sql;
        let usingClause = null;

        // Check if this is a DELETE statement with USING clause
        // More flexible regex to handle complex USING clauses including CTEs with aliases
        const deleteUsingRegex = /^(DELETE\s+FROM\s+\S+)\s+USING\s+(.+?)\s+WHERE\s+(.+)$/i;
        const match = sql.match(deleteUsingRegex);

        if (match) {
            const [, deleteFrom, using, whereCondition] = match;
            usingClause = using.trim();

            // Remove the USING clause from the SQL to make it parseable by node-sql-parser
            processedText = `${deleteFrom} WHERE ${whereCondition}`;
        }

        return { processedText, usingClause };
    }

    /**
     * Preprocess SQL for array index syntax like SPLIT(x)[0]
     * Returns an object with the processed text and the array accesses for post-processing
     */
    static preprocessArrayIndexSyntax(sql: string): {
        processedText: string;
        arrayAccesses: Array<{ original: string; placeholder: string; index: string }>;
    } {
        let processedText = sql;
        const arrayAccesses: Array<{ original: string; placeholder: string; index: string }> = [];

        // Find all array accesses like function()[0]
        const arrayAccessRegex = /(\w+\([^)]*\))\[(\d+)\]/g;
        let match;

        while ((match = arrayAccessRegex.exec(sql)) !== null) {
            const original = match[0]; // e.g., SPLIT(name, ',')[0]
            const funcCall = match[1]; // e.g., SPLIT(name, ',')
            const index = match[2]; // e.g., 0

            const placeholder = `__ARRAYACCESS__${index}__${funcCall}`;
            processedText = processedText.replace(original, placeholder);
            // Store the mapping for post-processing
            arrayAccesses.push({ original, placeholder, index });
        }

        return { processedText, arrayAccesses };
    }

    /**
     * Preprocess SQL for CREATE VIEW by separating the CREATE part from the query
     * This allows complex queries with CTEs and UNIONs to be processed as standalone SELECTs
     */
    static preprocessCreateView(sql: string, originalSql?: string): {
        processedText: string;
        createViewInfo: {
            createPart: string;
            queryPart: string;
            hasOrReplace: boolean;
        } | null;
    } {
        let processedText = sql;
        let createViewInfo = null;

        // Check if this is specifically a CREATE [OR REPLACE] VIEW statement
        // Must contain "VIEW" keyword and "AS" keyword, but not "DYNAMIC TABLE"
        const createViewRegex = /^(CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+\S+\s+AS)\s+(.+)$/is;
        const createViewMatch = sql.match(createViewRegex);
        
        // Make sure this is actually a VIEW statement and not any other CREATE type
        if (createViewMatch && /\bVIEW\b/i.test(sql) && !/\bDYNAMIC\s+TABLE\b/i.test(sql)) {
            const createPart = createViewMatch[1];
            const queryPart = createViewMatch[2];

            // Check for OR REPLACE in the original SQL if available, otherwise use processed SQL
            const sqlToCheck = originalSql || sql;
            const hasOrReplace = /CREATE\s+OR\s+REPLACE\s+VIEW/i.test(sqlToCheck);

            // Store the parts for post-processing
            createViewInfo = {
                createPart,
                queryPart,
                hasOrReplace,
            };

            // Process just the query part as a standalone SELECT
            processedText = queryPart;
        }

        return { processedText, createViewInfo };
    }

    /**
     * Preprocess SQL for GREATEST and LEAST functions that are not supported by node-sql-parser
     * Returns an object with the processed text and the function calls for post-processing
     */
    static preprocessGreatestLeast(sql: string): {
        processedText: string;
        greatestLeastFunctions: Array<{ original: string; placeholder: string; functionName: string }>;
    } {
        let processedText = sql;
        const greatestLeastFunctions: Array<{ original: string; placeholder: string; functionName: string }> = [];

        // Find GREATEST and LEAST function calls with their full argument lists (including _ignore_nulls variants)
        // This regex captures the function name and its complete argument list including nested parentheses
        const functionCallRegex =
            /\b(GREATEST(?:_IGNORE_NULLS)?|LEAST(?:_IGNORE_NULLS)?)\s*(\([^()]*(?:\([^()]*\)[^()]*)*\))/gi;
        let match;

        while ((match = functionCallRegex.exec(sql)) !== null) {
            const functionName = match[1].toUpperCase();
            const fullCall = match[0]; // e.g., "GREATEST(col1::DATE, col2::DATE)"

            // Create a unique placeholder using COALESCE which is supported by node-sql-parser
            // We'll use a pattern that won't conflict with real SQL: __GREATEST_N__ or __LEAST_N__
            const placeholder = `COALESCE(__${functionName}_${greatestLeastFunctions.length}__, NULL)`;

            // Replace the function call with our placeholder
            processedText = processedText.replace(fullCall, placeholder);

            // Store the mapping for post-processing
            greatestLeastFunctions.push({
                original: fullCall,
                placeholder: placeholder,
                functionName: functionName,
            });
        }

        return { processedText, greatestLeastFunctions };
    }

    /**
     * Preprocess SQL for PIVOT/UNPIVOT syntax that is not supported by node-sql-parser
     * Returns an object with the processed text and the PIVOT occurrences for post-processing
     */
    static preprocessPivot(sql: string): {
        processedText: string;
        pivotOccurrences: Array<{ original: string; placeholder: string; type: "PIVOT" | "UNPIVOT" }>;
    } {
        let processedText = sql;
        const pivotOccurrences: Array<{ original: string; placeholder: string; type: "PIVOT" | "UNPIVOT" }> = [];

        // Find PIVOT patterns (including UNPIVOT) - need to handle nested parentheses
        // Process occurrences from end to start to avoid index shifting issues
        const matches: Array<{ match: RegExpExecArray; original: string; type: "PIVOT" | "UNPIVOT" }> = [];
        const pivotStartRegex = /\b(PIVOT|UNPIVOT)\s*\(/gi;
        let match;

        // First, collect all matches
        while ((match = pivotStartRegex.exec(sql)) !== null) {
            const pivotType = match[1].toUpperCase() as "PIVOT" | "UNPIVOT";
            const startIndex = match.index;
            const openParenIndex = match.index + match[0].length - 1; // Position of opening parenthesis

            // Find the matching closing parenthesis
            let depth = 1;
            let pos = openParenIndex + 1;
            let endIndex = -1;

            while (pos < sql.length && depth > 0) {
                if (sql[pos] === "(") depth++;
                else if (sql[pos] === ")") depth--;

                if (depth === 0) {
                    endIndex = pos;
                    break;
                }
                pos++;
            }

            if (endIndex !== -1) {
                const original = sql.substring(startIndex, endIndex + 1);
                matches.push({ match, original, type: pivotType });
            }
        }

        // Process matches from end to start to avoid index shifting
        matches.reverse().forEach((matchInfo) => {
            const { original, type } = matchInfo;

            // Create a placeholder that node-sql-parser can handle
            // We'll use a simple identifier that we can identify later
            const placeholder = `__PIVOT_${pivotOccurrences.length}__`;

            // Replace PIVOT/UNPIVOT with our placeholder
            processedText = processedText.replace(original, placeholder);

            // Store the mapping for post-processing
            pivotOccurrences.push({
                original,
                placeholder,
                type,
            });
        });

        return { processedText, pivotOccurrences };
    }

    /**
     * Preprocess SQL for GROUP BY ALL syntax that is not supported by node-sql-parser
     * Returns an object with the processed text and the GROUP BY ALL occurrences for post-processing
     */
    static preprocessGroupByAll(sql: string): {
        processedText: string;
        groupByAllOccurrences: Array<{ original: string; placeholder: string }>;
    } {
        let processedText = sql;
        const groupByAllOccurrences: Array<{ original: string; placeholder: string }> = [];

        // Find GROUP BY ALL patterns (case insensitive)
        const groupByAllRegex = /\bGROUP\s+BY\s+ALL\b/gi;
        let match;

        while ((match = groupByAllRegex.exec(sql)) !== null) {
            const original = match[0]; // e.g., "GROUP BY ALL"

            // Create a placeholder that node-sql-parser can handle
            // We'll use GROUP BY with a dummy column that we can identify later
            const placeholder = `GROUP BY __GROUP_BY_ALL_${groupByAllOccurrences.length}__`;

            // Replace GROUP BY ALL with our placeholder
            processedText = processedText.replace(original, placeholder);

            // Store the mapping for post-processing
            groupByAllOccurrences.push({
                original,
                placeholder,
            });
        }

        return { processedText, groupByAllOccurrences };
    }

    /**
     * Apply post-processing for PostgreSQL casting - mark CAST nodes
     */
    static postprocessPostgreSQLCasting(
        ast: any,
        castings: Array<{ original: string; placeholder: string; expression: string; type: string }>,
    ): any {
        if (!ast || castings.length === 0) {
            return ast;
        }

        // Recursively traverse the AST and mark CAST nodes that were originally PostgreSQL casts
        const markPostgreSQLCasts = (node: any) => {
            if (!node || typeof node !== "object") return;

            if (node.type === "cast") {
                // Mark this CAST node as originally a PostgreSQL cast
                node.postgresql_cast = true;
            }

            // Recursively process all properties
            Object.keys(node).forEach((key) => {
                if (Array.isArray(node[key])) {
                    node[key].forEach(markPostgreSQLCasts);
                } else if (typeof node[key] === "object") {
                    markPostgreSQLCasts(node[key]);
                }
            });
        };

        if (Array.isArray(ast)) {
            ast.forEach(markPostgreSQLCasts);
        } else {
            markPostgreSQLCasts(ast);
        }

        return ast;
    }

    /**
     * Apply post-processing for QUALIFY clause
     */
    static postprocessQualify(ast: any, qualifyClause: string | null): any {
        if (!ast || !qualifyClause) {
            return ast;
        }

        // Handle both single statement and array of statements
        const processStatement = (stmt: any) => {
            if (stmt.type === "select") {
                stmt.qualify = qualifyClause;
            }
        };

        if (Array.isArray(ast)) {
            ast.forEach(processStatement);
        } else {
            processStatement(ast);
        }

        return ast;
    }

    /**
     * Apply post-processing for "CREATE OR REPLACE" statements to set the ignore_replace property
     */
    static postprocessCreateOrReplace(ast: any, createOrReplaceMatch: RegExpExecArray | null): any {
        if (!createOrReplaceMatch || !ast) {
            return ast;
        }

        if (Array.isArray(ast) && ast.length > 0) {
            // For array of statements
            ast.forEach((stmt) => {
                if (stmt.type === "create" && (stmt.keyword === "table" || stmt.keyword === "view")) {
                    // Set the ignore_replace property to indicate this was "OR REPLACE"
                    stmt.ignore_replace = "replace";
                }
            });
        } else if (
            !Array.isArray(ast) &&
            ast.type === "create" &&
            (ast.keyword === "table" || ast.keyword === "view")
        ) {
            ast.ignore_replace = "replace";
        }

        return ast;
    }

    /**
     * Apply post-processing for CREATE DYNAMIC TABLE statements
     */
    static postprocessCreateDynamicTable(
        ast: any,
        dynamicTableMatch: {
            tableName: string;
            targetLag?: string;
            warehouse?: string;
            refreshMode?: string;
            initialize?: string;
        } | null,
    ): any {
        if (!dynamicTableMatch || !ast) {
            return ast;
        }

        if (Array.isArray(ast) && ast.length > 0) {
            // For array of statements
            ast.forEach((stmt) => {
                if (stmt.type === "create" && stmt.keyword === "view") {
                    // Convert VIEW back to DYNAMIC TABLE and add the parameters
                    stmt.keyword = "dynamic_table";

                    if (dynamicTableMatch.targetLag) {
                        stmt.target_lag = dynamicTableMatch.targetLag;
                    }
                    if (dynamicTableMatch.refreshMode) {
                        stmt.refresh_mode = dynamicTableMatch.refreshMode;
                    }
                    if (dynamicTableMatch.initialize) {
                        stmt.initialize = dynamicTableMatch.initialize;
                    }
                    if (dynamicTableMatch.warehouse) {
                        stmt.warehouse = dynamicTableMatch.warehouse;
                    }
                }
            });
        } else if (!Array.isArray(ast) && ast.type === "create" && ast.keyword === "view") {
            // Convert VIEW back to DYNAMIC TABLE and add the parameters
            ast.keyword = "dynamic_table";
            if (dynamicTableMatch.targetLag) {
                ast.target_lag = dynamicTableMatch.targetLag;
            }
            if (dynamicTableMatch.refreshMode) {
                ast.refresh_mode = dynamicTableMatch.refreshMode;
            }
            if (dynamicTableMatch.initialize) {
                ast.initialize = dynamicTableMatch.initialize;
            }
            if (dynamicTableMatch.warehouse) {
                ast.warehouse = dynamicTableMatch.warehouse;
            }
        }

        return ast;
    }

    /**
     * Apply post-processing for TABLE(GENERATOR()) function calls
     */
    static postprocessTableGenerator(
        ast: any,
        tableGeneratorMatches: Array<{
            original: string;
            placeholder: string;
            parameters: { [key: string]: string };
        }>,
    ): any {
        if (!tableGeneratorMatches.length || !ast) {
            return ast;
        }

        // Recursively process the AST to find and replace placeholders
        const processNode = (node: any): any => {
            if (!node || typeof node !== "object") {
                return node;
            }

            if (Array.isArray(node)) {
                return node.map(processNode);
            }

            // Process all properties of the node
            const processed = { ...node };
            for (const key in processed) {
                if (processed.hasOwnProperty(key)) {
                    const value = processed[key];

                    // Check if this is a string that matches one of our placeholders
                    if (typeof value === "string") {
                        const match = tableGeneratorMatches.find((m) => value.includes(m.placeholder));
                        if (match) {
                            // Mark this node as a TABLE(GENERATOR()) call
                            processed[key] = value.replace(match.placeholder, match.original);
                            processed.__table_generator = {
                                parameters: match.parameters,
                                original: match.original,
                            };
                        }
                    } else {
                        processed[key] = processNode(value);
                    }
                }
            }

            return processed;
        };

        return processNode(ast);
    }

    /**
     * Apply post-processing for DELETE with USING clause
     */
    static postprocessDeleteUsing(ast: any, usingClause: string | null): any {
        if (!ast || !usingClause) {
            return ast;
        }

        // Handle both single statement and array of statements
        const processStatement = (stmt: any) => {
            if (stmt.type === "delete") {
                stmt.using = usingClause;
            }
        };

        if (Array.isArray(ast)) {
            ast.forEach(processStatement);
        } else {
            processStatement(ast);
        }

        return ast;
    }

    /**
     * Apply post-processing for array index syntax
     */
    static postprocessArrayIndexSyntax(
        ast: any,
        arrayAccesses: Array<{ original: string; placeholder: string; index: string }>,
    ): any {
        if (!ast || arrayAccesses.length === 0) {
            return ast;
        }

        // Store array access information in the AST for the printer to use
        if (!Array.isArray(ast)) {
            ast = [ast];
        }

        ast.forEach((statement: any) => {
            // Add array_accesses property to the root of each statement
            statement.array_accesses = arrayAccesses;
        });

        return Array.isArray(ast) && ast.length === 1 ? ast[0] : ast;
    }

    /**
     * Attach comments directly to AST nodes for both SELECT and CREATE statements
     * This creates a more natural association between comments and SQL elements
     */
    static attachCommentsToNodes(originalSQL: string, ast: any): any {
        if (!ast || !originalSQL) {
            return ast;
        }

        const lines = originalSQL.split("\n");
        const commentInfo: Array<{
            lineIndex: number;
            type: "inline" | "standalone";
            sqlContent?: string;
            comment: string;
        }> = [];

        // Parse all comments and their positions
        lines.forEach((line, lineIndex) => {
            // Check for standalone comment first (line with only whitespace before --)
            const standaloneMatch = line.match(/^\s*--\s*(.*)$/);
            // Check for inline comment (content before the --)
            const inlineMatch = line.match(/^(.+\S)\s+--\s*(.*)$/);

            if (standaloneMatch) {
                commentInfo.push({
                    lineIndex,
                    type: "standalone",
                    comment: standaloneMatch[1].trim(),
                });
            } else if (inlineMatch) {
                commentInfo.push({
                    lineIndex,
                    type: "inline",
                    sqlContent: inlineMatch[1].trim(),
                    comment: inlineMatch[2].trim(),
                });
            }
        });

        // Process statements to attach comments
        const processStatement = (statement: any) => {
            // Handle SELECT statements
            if (statement.type === "select" && statement.columns) {
                statement.columns = statement.columns.map((column: any, columnIndex: number) => {
                    const enhanced = { ...column };

                    // Find trailing comments (inline comments after this column)
                    const trailingComment = commentInfo.find(
                        (info) =>
                            info.type === "inline" &&
                            info.sqlContent &&
                            column.expr?.column &&
                            info.sqlContent.includes(column.expr.column),
                    );

                    if (trailingComment) {
                        enhanced.trailingComment = trailingComment.comment;
                    }

                    // Handle leading comments (standalone comments before this column)
                    if (columnIndex > 0) {
                        const prevColumn = statement.columns[columnIndex - 1];
                        const prevColumnLine = this.findColumnLineInSQL(lines, prevColumn.expr?.column);
                        const thisColumnLine = this.findColumnLineInSQL(lines, column.expr?.column);

                        const leadingComments = commentInfo.filter(
                            (info) =>
                                info.type === "standalone" &&
                                info.lineIndex > prevColumnLine &&
                                info.lineIndex < thisColumnLine,
                        );

                        if (leadingComments.length > 0) {
                            enhanced.leadingComments = leadingComments.map((c) => c.comment);
                        }
                    }

                    return enhanced;
                });
            }

            // Handle CREATE TABLE statements
            else if (statement.type === "create" && statement.keyword === "table" && statement.create_definitions) {
                statement.create_definitions = statement.create_definitions.map((def: any, defIndex: number) => {
                    const enhanced = { ...def };

                    // Find trailing comments for this column definition
                    if (def.column?.column) {
                        const trailingComment = commentInfo.find(
                            (info) =>
                                info.type === "inline" &&
                                info.sqlContent &&
                                // More precise matching: column name should be followed by whitespace or data type
                                info.sqlContent.match(new RegExp(`\\b${def.column.column}\\s+\\w+.*`)),
                        );

                        if (trailingComment) {
                            enhanced.trailingComment = trailingComment.comment;
                        }

                        // Handle leading comments (standalone comments before this column)
                        if (defIndex > 0) {
                            const prevDef = statement.create_definitions[defIndex - 1];
                            const prevColumnLine = this.findColumnLineInSQL(lines, prevDef.column?.column);
                            const thisColumnLine = this.findColumnLineInSQL(lines, def.column.column);

                            const leadingComments = commentInfo.filter(
                                (info) =>
                                    info.type === "standalone" &&
                                    info.lineIndex > prevColumnLine &&
                                    info.lineIndex < thisColumnLine,
                            );

                            if (leadingComments.length > 0) {
                                enhanced.leadingComments = leadingComments.map((c) => c.comment);
                            }
                        }
                    }

                    return enhanced;
                });
            }
        };

        // Apply to single statement or array of statements
        if (Array.isArray(ast)) {
            ast.forEach(processStatement);
        } else {
            processStatement(ast);
        }

        return ast;
    }

    /**
     * Attach preprocessed comments to AST nodes (for CREATE statements that needed preprocessing)
     */
    static attachPreprocessedCommentsToNodes(
        ast: any,
        inlineComments: Array<{ original: string; placeholder: string; comment: string }>,
    ): any {
        if (!ast || inlineComments.length === 0) {
            return ast;
        }

        // Process CREATE TABLE statements
        const processStatement = (statement: any) => {
            if (statement.type === "create" && statement.keyword === "table" && statement.create_definitions) {
                statement.create_definitions = statement.create_definitions.map((def: any) => {
                    const enhanced = { ...def };

                    // Find comment for this column by checking if the original comment contains this column
                    if (def.column?.column) {
                        const relevantComment = inlineComments.find((commentInfo) => {
                            // Check the original text (before preprocessing) to see if it contains this column definition
                            return commentInfo.original.includes(def.column.column);
                        });

                        if (relevantComment) {
                            enhanced.trailingComment = relevantComment.comment;
                        }
                    }

                    return enhanced;
                });
            }
        };

        // Apply to single statement or array of statements
        if (Array.isArray(ast)) {
            ast.forEach(processStatement);
        } else {
            processStatement(ast);
        }

        return ast;
    }

    /**
     * Helper function to find which line a column appears on in the SQL
     */
    static findColumnLineInSQL(lines: string[], columnName: string | undefined): number {
        if (!columnName) return -1;

        return lines.findIndex((line) => line.includes(columnName) && !line.trim().startsWith("--"));
    }

    /**
     * Apply post-processing for inline comments (legacy method - will be replaced by attachCommentsToNodes)
     */
    static postprocessInlineComments(
        ast: any,
        inlineComments: Array<{ original: string; placeholder: string; comment: string }>,
    ): any {
        if (!ast || inlineComments.length === 0) {
            return ast;
        }

        // Store inline comment information in the AST for the printer to use
        if (!Array.isArray(ast)) {
            ast = [ast];
        }

        ast.forEach((statement: any) => {
            // Add inline_comments property to the root of each statement
            statement.inline_comments = inlineComments;
        });

        return Array.isArray(ast) && ast.length === 1 ? ast[0] : ast;
    }

    /**
     * Apply post-processing for block comments
     */
    static postprocessBlockComments(
        ast: any,
        blockComments: Array<{ original: string; placeholder: string; comment: string }>,
    ): any {
        if (!ast || blockComments.length === 0) {
            return ast;
        }

        // Store block comment information in the AST for the printer to use
        if (!Array.isArray(ast)) {
            ast = [ast];
        }

        ast.forEach((statement: any) => {
            // Add block_comments property to the root of each statement
            statement.block_comments = blockComments;
        });

        return Array.isArray(ast) && ast.length === 1 ? ast[0] : ast;
    }

    /**
     * Apply post-processing for custom types (ARRAY, OBJECT)
     */
    static postprocessCustomTypes(
        ast: any,
        customTypes: Array<{ original: string; placeholder: string; type: string }>,
    ): any {
        if (!ast || customTypes.length === 0) {
            return ast;
        }

        // Process the AST to restore custom types
        if (!Array.isArray(ast)) {
            ast = [ast];
        }

        ast.forEach((statement: any) => {
            // Handle CREATE TABLE statements
            if (statement.type === "create" && statement.keyword === "table") {
                if (statement.create_definitions && Array.isArray(statement.create_definitions)) {
                    // Process each column definition
                    for (const column of statement.create_definitions) {
                        if (column.definition && column.definition.dataType) {
                            // Check if this column was using a custom type
                            for (const customType of customTypes) {
                                // Extract column name from the placeholder (which is "columnName VARCHAR")
                                const placeholderParts = customType.placeholder.split(" ");
                                const columnName = placeholderParts[0];

                                // Check if this is the column we need to restore
                                if (column.column?.column === columnName) {
                                    // For NUMBER types, preserve precision and scale information
                                    if (customType.type.startsWith("NUMBER")) {
                                        // Extract precision and scale from NUMBER(8,0)
                                        const params = customType.type.match(/NUMBER\((\d+)(?:,(\d+))?\)/);
                                        if (params) {
                                            column.definition.dataType = "NUMBER";
                                            column.definition.length = parseInt(params[1]);
                                            if (params[2] !== undefined) {
                                                column.definition.scale = parseInt(params[2]);
                                            }
                                            column.definition.parentheses = true;
                                        } else {
                                            column.definition.dataType = "NUMBER";
                                        }
                                    } else if (customType.type.startsWith("TIMESTAMP_NTZ")) {
                                        // Extract precision from TIMESTAMP_NTZ(9)
                                        const params = customType.type.match(/TIMESTAMP_NTZ\((\d+)\)/);
                                        if (params) {
                                            column.definition.dataType = "TIMESTAMP_NTZ";
                                            column.definition.length = parseInt(params[1]);
                                            column.definition.parentheses = true;
                                        } else {
                                            column.definition.dataType = "TIMESTAMP_NTZ";
                                        }
                                    } else {
                                        // Restore the original type for other custom types
                                        column.definition.dataType = customType.type;

                                        // Clear any length property since ARRAY and OBJECT don't have lengths
                                        delete column.definition.length;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Store custom_types in the statement for the printer to use
            statement.custom_types = customTypes;
        });

        return Array.isArray(ast) && ast.length === 1 ? ast[0] : ast;
    }

    /**
     * Apply post-processing for GREATEST and LEAST functions
     */
    static postprocessGreatestLeast(
        ast: any,
        greatestLeastFunctions: Array<{ original: string; placeholder: string; functionName: string }>,
    ): any {
        if (!ast || greatestLeastFunctions.length === 0) {
            return ast;
        }

        // Store GREATEST/LEAST function information in the AST for the printer to use
        if (!Array.isArray(ast)) {
            ast = [ast];
        }

        ast.forEach((statement: any) => {
            // Add greatest_least_functions property to the root of each statement
            statement.greatest_least_functions = greatestLeastFunctions;
        });

        return Array.isArray(ast) && ast.length === 1 ? ast[0] : ast;
    }

    /**
     * Apply post-processing for PIVOT/UNPIVOT - mark PIVOT nodes
     */
    static postprocessPivot(
        ast: any,
        pivotOccurrences: Array<{ original: string; placeholder: string; type: "PIVOT" | "UNPIVOT" }>,
    ): any {
        if (!ast || pivotOccurrences.length === 0) {
            return ast;
        }

        // Recursively traverse the AST and find nodes with our placeholders
        const processNode = (node: any) => {
            if (!node || typeof node !== "object") {
                return;
            }

            // Check if this node contains any of our PIVOT placeholders
            Object.keys(node).forEach((key) => {
                if (typeof node[key] === "string") {
                    // Check if this string contains any of our placeholders
                    for (const occurrence of pivotOccurrences) {
                        if (node[key].includes(occurrence.placeholder)) {
                            // Replace the placeholder with the original PIVOT syntax
                            node[key] = node[key].replace(occurrence.placeholder, occurrence.original);

                            // Mark this node as containing PIVOT syntax
                            if (!node.pivot_info) {
                                node.pivot_info = [];
                            }
                            node.pivot_info.push({
                                type: occurrence.type,
                                original: occurrence.original,
                            });
                        }
                    }
                } else if (Array.isArray(node[key])) {
                    node[key].forEach((item: any) => processNode(item));
                } else if (typeof node[key] === "object" && node[key] !== null) {
                    processNode(node[key]);
                }
            });
        };

        if (Array.isArray(ast)) {
            ast.forEach(processNode);
        } else {
            processNode(ast);
        }

        return ast;
    }

    /**
     * Apply post-processing for GROUP BY ALL - mark GROUP BY nodes
     */
    static postprocessGroupByAll(
        ast: any,
        groupByAllOccurrences: Array<{ original: string; placeholder: string }>,
    ): any {
        if (!ast || groupByAllOccurrences.length === 0) {
            return ast;
        }

        // Recursively traverse the AST and find GROUP BY nodes with our placeholders
        const processNode = (node: any) => {
            if (!node || typeof node !== "object") {
                return;
            }

            // Handle GROUP BY clauses
            if (node.groupby && node.groupby.columns && Array.isArray(node.groupby.columns)) {
                for (let i = 0; i < node.groupby.columns.length; i++) {
                    const groupByItem = node.groupby.columns[i];
                    if (groupByItem && groupByItem.type === "column_ref" && groupByItem.column) {
                        // Check if this is one of our GROUP BY ALL placeholders
                        for (const occurrence of groupByAllOccurrences) {
                            const placeholderColumn = occurrence.placeholder.replace("GROUP BY ", "");
                            if (groupByItem.column === placeholderColumn) {
                                // Mark this as a GROUP BY ALL
                                node.groupby = "ALL";
                                return; // Exit early to avoid further processing
                            }
                        }
                    }
                }
            }

            // Recursively process all properties (skip if groupby was converted to "ALL")
            Object.keys(node).forEach((key) => {
                if (key === "groupby" && node[key] === "ALL") {
                    // Skip processing the "ALL" string
                    return;
                }
                if (Array.isArray(node[key])) {
                    node[key].forEach((item: any) => processNode(item));
                } else if (typeof node[key] === "object" && node[key] !== null) {
                    processNode(node[key]);
                }
            });
        };

        if (Array.isArray(ast)) {
            ast.forEach(processNode);
        } else {
            processNode(ast);
        }

        return ast;
    }

    /**
     * Apply post-processing for CREATE VIEW by reconstructing the CREATE statement
     */
    static postprocessCreateView(
        ast: any,
        createViewInfo: {
            createPart: string;
            queryPart: string;
            hasOrReplace: boolean;
        } | null,
    ): any {
        if (!ast || !createViewInfo) {
            return ast;
        }

        // The AST should be the parsed SELECT query, we need to wrap it in a CREATE VIEW structure
        const selectAst = Array.isArray(ast) ? ast[0] : ast;
        
        // Create the CREATE VIEW AST structure
        const createViewAst = {
            type: "create",
            keyword: "view",
            replace: createViewInfo.hasOrReplace ? "or replace" : undefined,
            view: this.parseViewName(createViewInfo.createPart),
            select: selectAst,
        };

        return createViewAst;
    }

    /**
     * Extract view name from CREATE VIEW part
     */
    static parseViewName(createPart: string): { view: string; db?: string } {
        const viewNameMatch = createPart.match(/VIEW\s+(\S+)/i);
        if (viewNameMatch) {
            const fullName = viewNameMatch[1];
            if (fullName.includes('.')) {
                const [db, view] = fullName.split('.');
                return { db, view };
            } else {
                return { view: fullName };
            }
        }
        return { view: "unknown_view" };
    }

    /**
     * Parse SQL code into an AST
     */
    static parse(text: string): SQLNode {
        const lines = text.split("\n");
        const cleanText = text.trim();

        // Check if it's multiple statements
        if (this.isMultipleStatements(cleanText)) {
            const statements = this.splitStatements(cleanText);
            const parsedStatements = [];

            for (const stmt of statements) {
                try {
                    const trimmedStmt = stmt.trim();

                    const leadingCommentRegex = /^(--.*\n)+/;
                    const commentMatch = trimmedStmt.match(leadingCommentRegex);
                    const comments = commentMatch ? commentMatch[0].trim() : "";

                    if (comments) {
                        // If there are leading comments, include them in the AST
                        parsedStatements.push({
                            type: "comment",
                            text: comments,
                            loc: {
                                start: { line: 1, column: 0 },
                                end: { line: 1, column: comments.length },
                            },
                        });
                    }

                    const sqlOnly = comments ? trimmedStmt.replace(leadingCommentRegex, "").trim() : trimmedStmt;
                    if (this.isGrantStatement(sqlOnly)) {
                        // Handle GRANT statement
                        parsedStatements.push(this.parseGrantStatement(sqlOnly));
                    } else {
                        // Preprocess decimal numbers (normalize .5 to 0.5)
                        const textAfterDecimalNormalization = this.preprocessDecimalNumbers(sqlOnly);

                        // Preprocess QUALIFY clause
                        const {
                            processedText: textAfterQualify,
                            qualifyClause,
                            castings,
                        } = this.preprocessQualify(textAfterDecimalNormalization);

                        // Preprocess CREATE OR REPLACE syntax
                        const { processedText: textAfterCreateOrReplace, createOrReplaceMatch } =
                            this.preprocessCreateOrReplace(textAfterQualify);

                        // Preprocess CREATE VIEW by separating CREATE part from query (must be BEFORE DYNAMIC TABLE)
                        const { processedText: textAfterCreateView, createViewInfo } =
                            this.preprocessCreateView(textAfterCreateOrReplace, sqlOnly);

                        // Preprocess CREATE DYNAMIC TABLE syntax
                        const { processedText: textAfterDynamicTable, dynamicTableMatch } =
                            this.preprocessCreateDynamicTable(textAfterCreateView);

                        // Preprocess TABLE(GENERATOR()) syntax
                        const { processedText: textAfterTableGenerator, tableGeneratorMatches } =
                            this.preprocessTableGenerator(textAfterDynamicTable);

                        // Preprocess DELETE with USING clause
                        const { processedText: textAfterDeleteUsing, usingClause } =
                            this.preprocessDeleteUsing(textAfterTableGenerator);

                        // Preprocess SQL for custom types (ARRAY and OBJECT)
                        const { processedText: textAfterCustomTypes, customTypes } =
                            this.preprocessCustomTypes(textAfterDeleteUsing);

                        // Preprocess GREATEST and LEAST functions
                        const { processedText: textAfterGreatestLeast, greatestLeastFunctions } =
                            this.preprocessGreatestLeast(textAfterCustomTypes);

                        // Preprocess PIVOT/UNPIVOT syntax
                        const { processedText: textAfterPivot, pivotOccurrences } =
                            this.preprocessPivot(textAfterGreatestLeast);

                        // Preprocess GROUP BY ALL syntax
                        const { processedText: textAfterGroupByAll, groupByAllOccurrences } =
                            this.preprocessGroupByAll(textAfterPivot);

                        // Preprocess inline comments ONLY for CREATE statements (node-sql-parser needs this)
                        let textAfterInlineComments = textAfterGroupByAll;
                        let inlineComments: Array<{ original: string; placeholder: string; comment: string }> = [];
                        if (sqlOnly.trim().toUpperCase().startsWith("CREATE") && !createViewInfo) {
                            // Only preprocess inline comments if we're not processing a CREATE VIEW
                            // (CREATE VIEW queries are now processed as standalone SELECTs)
                            const preprocessResult = this.preprocessInlineComments(textAfterCreateView);
                            textAfterInlineComments = preprocessResult.processedText;
                            inlineComments = preprocessResult.inlineComments;
                        }

                        // Preprocess block comments (still using old approach for now)
                        const { processedText: textAfterBlockComments, blockComments } =
                            this.preprocessBlockComments(textAfterInlineComments);

                        // Preprocess array index syntax
                        const { processedText, arrayAccesses } =
                            this.preprocessArrayIndexSyntax(textAfterBlockComments);

                        // Parse the processed text
                        const stmtAst = this.parser.astify(processedText);

                        // Apply post-processing for CREATE OR REPLACE
                        let processedAst = this.postprocessCreateOrReplace(stmtAst, createOrReplaceMatch);

                        // Apply post-processing for CREATE VIEW (must be BEFORE DYNAMIC TABLE)
                        processedAst = this.postprocessCreateView(processedAst, createViewInfo);

                        // Apply post-processing for CREATE DYNAMIC TABLE
                        processedAst = this.postprocessCreateDynamicTable(processedAst, dynamicTableMatch);

                        // Apply post-processing for TABLE(GENERATOR())
                        processedAst = this.postprocessTableGenerator(processedAst, tableGeneratorMatches);

                        // Apply post-processing for PostgreSQL casting
                        processedAst = this.postprocessPostgreSQLCasting(processedAst, castings);

                        // Apply post-processing for QUALIFY clause
                        processedAst = this.postprocessQualify(processedAst, qualifyClause);

                        // Apply post-processing for DELETE with USING
                        processedAst = this.postprocessDeleteUsing(processedAst, usingClause);

                        // Apply post-processing for array index syntax
                        processedAst = this.postprocessArrayIndexSyntax(processedAst, arrayAccesses);

                        // Apply post-processing for block comments
                        processedAst = this.postprocessBlockComments(processedAst, blockComments);

                        // Apply post-processing for GREATEST and LEAST functions
                        processedAst = this.postprocessGreatestLeast(processedAst, greatestLeastFunctions);

                        // Apply post-processing for GROUP BY ALL
                        processedAst = this.postprocessGroupByAll(processedAst, groupByAllOccurrences);


                        // Apply post-processing for PIVOT/UNPIVOT
                        processedAst = this.postprocessPivot(processedAst, pivotOccurrences);

                        // Apply post-processing for custom types
                        processedAst = this.postprocessCustomTypes(processedAst, customTypes);

                        // NEW: Attach comments directly to AST nodes (for SELECT and CREATE statements)
                        // For CREATE statements with preprocessed inline comments, merge both approaches
                        if (inlineComments.length > 0) {
                            processedAst = this.attachPreprocessedCommentsToNodes(processedAst, inlineComments);
                        } else {
                            processedAst = this.attachCommentsToNodes(sqlOnly, processedAst);
                        }

                        // stmtAst could be an array (although unlikely for a single statement)
                        if (Array.isArray(processedAst)) {
                            parsedStatements.push(...processedAst);
                        } else {
                            parsedStatements.push(processedAst);
                        }
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to parse statement:\n\n${stmt}\n\nError: ${errorMessage}`);
                }
            }

            return {
                type: "sql",
                text: cleanText,
                ast: parsedStatements,
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: lines.length, column: lines[lines.length - 1].length },
                },
            };
        }
        // Check if it's a single GRANT statement
        else if (this.isGrantStatement(cleanText)) {
            const grantAst = this.parseGrantStatement(cleanText);
            return {
                type: "sql",
                text: cleanText,
                ast: grantAst,
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: lines.length, column: lines[lines.length - 1].length },
                },
            };
        }
        // Handle statements with standalone comments before SQL
        else if (this.hasStandaloneComments(cleanText)) {
            const { comments, sqlStatement } = this.separateCommentsFromSQL(cleanText);

            // Parse the SQL statement separately
            let sqlAst: any;

            // Check if the SQL part is a GRANT statement
            if (this.isGrantStatement(sqlStatement)) {
                sqlAst = this.parseGrantStatement(sqlStatement);
            } else {
                // For other SQL statements, parse normally (but this will likely still fail)
                // For now, create a simple structure
                sqlAst = {
                    type: "unknown",
                    statement: sqlStatement,
                };
            }

            // Create an AST that includes both comments and SQL
            const combinedAst = [
                ...comments.map((comment) => ({
                    type: "comment",
                    value: comment,
                })),
                sqlAst,
            ];

            return {
                type: "sql",
                text: cleanText,
                ast: combinedAst,
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: lines.length, column: lines[lines.length - 1].length },
                },
            };
        }

        // Preprocess decimal numbers (normalize .5 to 0.5)
        const textAfterDecimalNormalization = this.preprocessDecimalNumbers(cleanText);

        // Preprocess QUALIFY clause
        const {
            processedText: textAfterQualify,
            qualifyClause,
            castings,
        } = this.preprocessQualify(textAfterDecimalNormalization);

        // Preprocess CREATE OR REPLACE syntax
        const { processedText: textAfterCreateOrReplace, createOrReplaceMatch } =
            this.preprocessCreateOrReplace(textAfterQualify);

        // Preprocess CREATE VIEW by separating CREATE part from query (must be BEFORE DYNAMIC TABLE)
        const { processedText: textAfterCreateView, createViewInfo } =
            this.preprocessCreateView(textAfterCreateOrReplace, cleanText);

        // Preprocess CREATE DYNAMIC TABLE syntax
        const { processedText: textAfterDynamicTable, dynamicTableMatch } =
            this.preprocessCreateDynamicTable(textAfterCreateView);

        // Preprocess TABLE(GENERATOR()) syntax
        const { processedText: textAfterTableGenerator, tableGeneratorMatches } =
            this.preprocessTableGenerator(textAfterDynamicTable);

        // Preprocess DELETE with USING clause
        const { processedText: textAfterDeleteUsing, usingClause } =
            this.preprocessDeleteUsing(textAfterTableGenerator);

        // Preprocess SQL for custom types (ARRAY and OBJECT)
        const { processedText: textAfterCustomTypes, customTypes } = this.preprocessCustomTypes(textAfterDeleteUsing);

        // Preprocess GREATEST and LEAST functions
        const { processedText: textAfterGreatestLeast, greatestLeastFunctions } =
            this.preprocessGreatestLeast(textAfterCustomTypes);

        // Preprocess PIVOT/UNPIVOT syntax
        const { processedText: textAfterPivot, pivotOccurrences } = this.preprocessPivot(textAfterGreatestLeast);

        // Preprocess GROUP BY ALL syntax
        const { processedText: textAfterGroupByAll, groupByAllOccurrences } = this.preprocessGroupByAll(textAfterPivot);

        // Preprocess inline comments ONLY for CREATE statements WITH ACTUAL inline comments (node-sql-parser needs this)
        let textAfterInlineComments = textAfterGroupByAll;
        let inlineComments: Array<{ original: string; placeholder: string; comment: string }> = [];
        if (cleanText.trim().toUpperCase().startsWith("CREATE") && !createViewInfo) {
            // Only preprocess inline comments if we're not processing a CREATE VIEW
            // Check if there are actual inline comments (comments on same line as SQL content, not standalone)
            // Look for pattern: SQL_content -- comment_text (content after --)
            const hasInlineComments = /\w+[^-\r\n]*--[^\r\n]*\S/.test(cleanText);
            if (hasInlineComments) {
                const preprocessResult = this.preprocessInlineComments(textAfterCreateView);
                textAfterInlineComments = preprocessResult.processedText;
                inlineComments = preprocessResult.inlineComments;
            }
        }

        // Preprocess block comments (still using old approach for now)
        const { processedText: textAfterBlockComments, blockComments } =
            this.preprocessBlockComments(textAfterInlineComments);

        // Preprocess array index syntax
        const { processedText, arrayAccesses } = this.preprocessArrayIndexSyntax(textAfterBlockComments);

        try {
            // Parse the processed text
            const ast = this.parser.astify(processedText);

            // Post-processing for CREATE OR REPLACE
            let processedAst = this.postprocessCreateOrReplace(ast, createOrReplaceMatch);

            // Post-processing for CREATE VIEW (must be BEFORE DYNAMIC TABLE)
            processedAst = this.postprocessCreateView(processedAst, createViewInfo);

            // Post-processing for CREATE DYNAMIC TABLE
            processedAst = this.postprocessCreateDynamicTable(processedAst, dynamicTableMatch);

            // Post-processing for TABLE(GENERATOR())
            processedAst = this.postprocessTableGenerator(processedAst, tableGeneratorMatches);

            // Post-processing for PostgreSQL casting
            processedAst = this.postprocessPostgreSQLCasting(processedAst, castings);

            // Post-processing for QUALIFY clause
            processedAst = this.postprocessQualify(processedAst, qualifyClause);

            // Post-processing for DELETE with USING
            processedAst = this.postprocessDeleteUsing(processedAst, usingClause);

            // Post-processing for array index syntax
            processedAst = this.postprocessArrayIndexSyntax(processedAst, arrayAccesses);

            // Post-processing for block comments
            processedAst = this.postprocessBlockComments(processedAst, blockComments);

            // Post-processing for GREATEST and LEAST functions
            processedAst = this.postprocessGreatestLeast(processedAst, greatestLeastFunctions);

            // Post-processing for GROUP BY ALL
            processedAst = this.postprocessGroupByAll(processedAst, groupByAllOccurrences);


            // Post-processing for PIVOT/UNPIVOT
            processedAst = this.postprocessPivot(processedAst, pivotOccurrences);

            // Post-processing for custom types
            processedAst = this.postprocessCustomTypes(processedAst, customTypes);

            // NEW: Attach comments directly to AST nodes (for SELECT and CREATE statements)
            // For CREATE statements with preprocessed inline comments, merge both approaches
            if (inlineComments.length > 0) {
                processedAst = this.attachPreprocessedCommentsToNodes(processedAst, inlineComments);
            } else {
                processedAst = this.attachCommentsToNodes(cleanText, processedAst);
            }

            return {
                type: "sql",
                text: cleanText, // Keep the original text
                ast: processedAst,
                loc: {
                    start: { line: 1, column: 0 },
                    end: { line: lines.length, column: lines[lines.length - 1].length },
                },
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse SQL:\n\n${cleanText}\n\nError: ${errorMessage}`);
        }
    }

    /**
     * Get the start location of a node
     */
    static locStart(node: { loc?: { start: number } }): number {
        return node.loc?.start ?? 0;
    }

    /**
     * Get the end location of a node
     */
    static locEnd(node: { loc?: { end: number } }): number {
        return node.loc?.end ?? 0;
    }
}
