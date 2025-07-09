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
        const ast = this.parser.astify(processedText, { type: "snowflake" });

        if (createOrReplaceMatch && ast && Array.isArray(ast) && ast.length > 0) {
            // For array of statements
            ast.forEach((stmt) => {
                if (stmt.type === "create" && (stmt.keyword === "table" || stmt.keyword === "view")) {
                    // Set the ignore_replace property to indicate this was "OR REPLACE"
                    stmt.ignore_replace = "replace";
                }
            });
        } else if (
            ast &&
            !Array.isArray(ast) &&
            ast.type === "create" &&
            ((hasOrReplaceTable && ast.keyword === "table") || (hasOrReplaceView && ast.keyword === "view"))
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
