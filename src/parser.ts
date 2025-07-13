import { Parser } from "node-sql-parser";
import { SQLNode } from "./types";

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
                        // Preprocess CREATE OR REPLACE syntax
                        const { processedText, createOrReplaceMatch } = this.preprocessCreateOrReplace(sqlOnly);

                        // Parse the processed text
                        const stmtAst = this.parser.astify(processedText);

                        // Apply post-processing for CREATE OR REPLACE
                        const processedAst = this.postprocessCreateOrReplace(stmtAst, createOrReplaceMatch);

                        // stmtAst could be an array (although unlikely for a single statement)
                        if (Array.isArray(processedAst)) {
                            parsedStatements.push(...processedAst);
                        } else {
                            parsedStatements.push(processedAst);
                        }
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to parse statement: "${stmt}". Error: ${errorMessage}`);
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

        // Preprocess CREATE OR REPLACE syntax
        const { processedText, createOrReplaceMatch } = this.preprocessCreateOrReplace(cleanText);

        // Parse the processed text
        const ast = this.parser.astify(processedText);

        // Post-processing for CREATE OR REPLACE
        const processedAst = this.postprocessCreateOrReplace(ast, createOrReplaceMatch);

        return {
            type: "sql",
            text: cleanText, // Keep the original text with "OR REPLACE"
            ast: processedAst,
            loc: {
                start: { line: 1, column: 0 },
                end: { line: lines.length, column: lines[lines.length - 1].length },
            },
        };
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
