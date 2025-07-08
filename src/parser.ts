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

        const ast = this.parser.astify(cleanText);

        return {
            type: "sql",
            text: cleanText,
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
