import { Parser } from "node-sql-parser";
import { SQLNode } from "./types";

export class SQLParser {
    private static parser = new Parser();

    /**
     * Parse SQL code into an AST
     */
    static parse(text: string): SQLNode {
        const lines = text.split("\n");
        const cleanText = text.trim();

        // Preprocessing: Handle "CREATE OR REPLACE TABLE" for Snowflake dialect
        let processedText = cleanText;
        const createOrReplaceTableRegex = /CREATE\s+OR\s+REPLACE\s+TABLE\s+/i;

        // Check if the SQL contains "CREATE OR REPLACE TABLE"
        if (createOrReplaceTableRegex.test(processedText)) {
            // Convert it to standard "CREATE TABLE" that the parser can handle
            // We'll store the original text to preserve it for later output
            processedText = processedText.replace(createOrReplaceTableRegex, "CREATE TABLE ");
        }

        // Parse the processed text
        const ast = this.parser.astify(processedText, { type: "snowflake" });

        // If the statement was a "CREATE OR REPLACE TABLE", mark it in the AST
        if (createOrReplaceTableRegex.test(cleanText) && ast && Array.isArray(ast) && ast.length > 0) {
            // For array of statements
            ast.forEach((stmt) => {
                if (stmt.type === "create" && stmt.keyword === "table") {
                    // Set the ignore_replace property to indicate this was "OR REPLACE"
                    stmt.ignore_replace = "replace";
                }
            });
        } else if (
            createOrReplaceTableRegex.test(cleanText) &&
            ast &&
            !Array.isArray(ast) &&
            ast.type === "create" &&
            ast.keyword === "table"
        ) {
            // For a single statement
            ast.ignore_replace = "replace";
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
