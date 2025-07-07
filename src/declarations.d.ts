declare module "prettier" {
    namespace doc {
        namespace builders {
            type DocCommand = any;
            const join: any;
            const indent: any;
            const hardline: any;
            const line: any;
            const group: any;
        }
    }

    function format(source: string, options?: any): Promise<string>;
}
declare module "prettier/parser-babel" {
    export const parsers: Record<string, any>;
}
declare module "prettier/parser-typescript" {
    export const parsers: Record<string, any>;
}

declare module 'node-sql-parser' {
    import { LocationRange } from "pegjs";

    export interface BaseFrom {
        db: string | null;
        table: string;
        as: string | null;
        schema?: string;
        loc?: LocationRange;
    }

    export interface Join extends BaseFrom {
        join: "INNER JOIN" | "LEFT JOIN" | "RIGHT JOIN";
        using?: string[];
        on?: Binary;
    }

    export interface Binary {
        type: "binary_expr";
        operator: string;
        left: any;
        right: any;
        loc?: LocationRange;
        parentheses?: boolean;
    }

    export interface Column {
        expr: any;
        as: any;
        type?: string;
        loc?: LocationRange;
    }

    export interface Select {
        with: any[] | null;
        type: "select";
        options: any[] | null;
        distinct: "DISTINCT" | null;
        columns: any[] | Column[];
        from: any[] | null;
        where: Binary | null;
        groupby: { columns: any[] | null, modifiers: any[] };
        having: any[] | null;
        orderby: any[] | null;
        limit: any | null;
        window?: any;
        qualify?: any[] | null;
        _orderby?: any[] | null;
        _limit?: any | null;
        parentheses_symbol?: boolean;
        _parentheses?: boolean;
        loc?: LocationRange;
        _next?: Select;
        set_op?: string;
    }

    export type AST = Select;

    export class Parser {
        astify(sql: string, options?: { database?: string }): AST | AST[];
    }
}