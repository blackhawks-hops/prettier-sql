import { AST } from "node-sql-parser";

export interface Location {
    start: { line: number; column: number };
    end: { line: number; column: number };
}

export interface SQLNode {
    type: string;
    ast: AST | AST[];
    text: string;
    loc: Location;
}
