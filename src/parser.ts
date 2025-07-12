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
     * Split multiple SQL statements and check if they are all GRANT statements
     */
    static isMultipleGrantStatements(sql: string): boolean {
        const statements = sql
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0);
        return statements.length > 1 && statements.every((stmt) => this.isGrantStatement(stmt + ";"));
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
     * Parse SQL code into an AST
     */
    static parse(text: string): SQLNode {
        const lines = text.split("\n");
        const cleanText = text.trim();

        // Check if it's multiple GRANT statements
        if (this.isMultipleGrantStatements(cleanText)) {
            const statements = cleanText
                .split(";")
                .map((stmt) => stmt.trim())
                .filter((stmt) => stmt.length > 0)
                .map((stmt) => this.parseGrantStatement(stmt + ";"));

            return {
                type: "sql",
                text: cleanText,
                ast: statements,
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

        // Preprocessing: Handle "CREATE OR REPLACE TABLE/VIEW" for Snowflake dialect
        let processedText = cleanText;
        const createOrReplaceMatch = /CREATE\s+OR\s+REPLACE\s+(TABLE|VIEW)\s+/i.exec(cleanText);
        if (createOrReplaceMatch) {
            processedText = processedText.replace(
                createOrReplaceMatch[0],
                `CREATE ${createOrReplaceMatch[1].toUpperCase()} `
            );
        }

        // Parse the processed text
        const ast = this.parser.astify(processedText);

        // Post-processing: overload ignore_replace property for "CREATE OR REPLACE"
        if (createOrReplaceMatch && ast) {
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
        }

        return {
            type: "sql",
            text: cleanText, // Keep the original text with "OR REPLACE"
            ast,
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
