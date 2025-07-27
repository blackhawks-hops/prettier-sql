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
        // Basic regex pattern to extract parts of the GRANT statement
        const grantRegex =
            /^\s*GRANT\s+([^\s]+)\s+ON\s+([^\s]+)\s+([^\s]+)(?:\s+IN\s+([^\s]+)\s+([^\s]+))?\s+TO\s+([^\s]+)\s+([^;]+);?\s*$/i;
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
            privilege: privilege?.toUpperCase(),
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
     * Preprocess SQL for QUALIFY clause (Snowflake/BigQuery extension)
     * QUALIFY is like WHERE but for window functions - not supported by node-sql-parser
     * This function also handles QUALIFY clauses inside CTEs
     */
    static preprocessQualify(sql: string): {
        processedText: string;
        qualifyClause: string | null;
    } {
        let processedText = sql;

        // First, handle QUALIFY clauses inside CTEs
        processedText = this.preprocessQualifyInCTEs(processedText);

        // Then handle top-level QUALIFY clause
        const topLevelResult = this.preprocessSingleQualify(processedText);
        
        return {
            processedText: topLevelResult.processedText,
            qualifyClause: topLevelResult.qualifyClause
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
                if (sql[pos] === '(') depth++;
                else if (sql[pos] === ')') depth--;
                
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
                    const fullReplacement = cteStart + processedCTE.processedText + ')';
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

            if (char === '(') {
                depth++;
            } else if (char === ')') {
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
            index: qualifyMatch.index
        };

        if (match) {
            qualifyClause = match[1].trim();
            // Remove the QUALIFY clause from the SQL to make it parseable
            processedText = processedText.replace(match[0], '');
            // Clean up any extra whitespace
            processedText = processedText.replace(/\s+/g, ' ').trim();
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
                        // Preprocess QUALIFY clause
                        const { processedText: textAfterQualify, qualifyClause } = this.preprocessQualify(sqlOnly);

                        // Preprocess CREATE OR REPLACE syntax
                        const { processedText: textAfterCreateOrReplace, createOrReplaceMatch } =
                            this.preprocessCreateOrReplace(textAfterQualify);

                        // Preprocess DELETE with USING clause
                        const { processedText: textAfterDeleteUsing, usingClause } =
                            this.preprocessDeleteUsing(textAfterCreateOrReplace);

                        // Preprocess SQL for custom types (ARRAY and OBJECT)
                        const { processedText: textAfterCustomTypes, customTypes } =
                            this.preprocessCustomTypes(textAfterDeleteUsing);

                        // Preprocess GREATEST and LEAST functions
                        const { processedText: textAfterGreatestLeast, greatestLeastFunctions } =
                            this.preprocessGreatestLeast(textAfterCustomTypes);

                        // Preprocess inline comments ONLY for CREATE statements (node-sql-parser needs this)
                        let textAfterInlineComments = textAfterGreatestLeast;
                        let inlineComments: Array<{ original: string; placeholder: string; comment: string }> = [];
                        if (sqlOnly.trim().toUpperCase().startsWith("CREATE")) {
                            const preprocessResult = this.preprocessInlineComments(textAfterGreatestLeast);
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

        // Preprocess QUALIFY clause
        const { processedText: textAfterQualify, qualifyClause } = this.preprocessQualify(cleanText);

        // Preprocess CREATE OR REPLACE syntax
        const { processedText: textAfterCreateOrReplace, createOrReplaceMatch } =
            this.preprocessCreateOrReplace(textAfterQualify);

        // Preprocess DELETE with USING clause
        const { processedText: textAfterDeleteUsing, usingClause } =
            this.preprocessDeleteUsing(textAfterCreateOrReplace);

        // Preprocess SQL for custom types (ARRAY and OBJECT)
        const { processedText: textAfterCustomTypes, customTypes } = this.preprocessCustomTypes(textAfterDeleteUsing);

        // Preprocess GREATEST and LEAST functions
        const { processedText: textAfterGreatestLeast, greatestLeastFunctions } =
            this.preprocessGreatestLeast(textAfterCustomTypes);

        // Preprocess inline comments ONLY for CREATE statements WITH ACTUAL inline comments (node-sql-parser needs this)
        let textAfterInlineComments = textAfterGreatestLeast;
        let inlineComments: Array<{ original: string; placeholder: string; comment: string }> = [];
        if (cleanText.trim().toUpperCase().startsWith("CREATE")) {
            // Check if there are actual inline comments (comments on same line as SQL content, not standalone)
            // Look for pattern: SQL_content -- comment_text (content after --)
            const hasInlineComments = /\w+[^-\r\n]*--[^\r\n]*\S/.test(cleanText);
            if (hasInlineComments) {
                const preprocessResult = this.preprocessInlineComments(textAfterGreatestLeast);
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
