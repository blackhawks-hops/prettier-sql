export enum NodeType {
    Token = "Token",
    Select = "Select",
    CTE = "CTE",
    Join = "Join",
    Where = "Where",
    GroupBy = "GroupBy",
    OrderBy = "OrderBy",
}

export interface Location {
    start: { line: number; column: number };
    end: { line: number; column: number };
}

export interface Node {
    type: NodeType;
    value?: string;
    name?: string;
    columns?: string[];
    from?: string;
    joins?: Node[];
    where?: string[];
    body?: Node[];
    joinType?: string;
    table?: string;
    condition?: string[];
}

export interface SQLNode {
    type: string;
    value: string;
    tokens: string[];
    body: Node[];
    loc: Location;
}
