import { doc } from "prettier";
import { Node, NodeType, SQLNode, Location } from "./types";

const { join, indent, hardline } = doc.builders;

/**
 * Format SQL AST into a pretty-printed string
 */
export function print(path: { getValue: () => unknown }): doc.builders.DocCommand {
    const node = path.getValue() as Record<string, unknown>;

    // If this is a SQL node from a template literal, format it
    if (hasSqlAst(node)) {
        // Format the SQL and add a newline after the backtick for template literals
        const sqlAst = node.sqlAst as SQLNode & { isTemplateLiteral?: boolean };
        const formattedSql = printSQLNode(sqlAst);

        // For template literals, ensure proper formatting
        if (sqlAst.isTemplateLiteral) {
            return [hardline, formattedSql];
        } else {
            return formattedSql;
        }
    }

    // Format a SQL file
    if (
        node.type === "sql" &&
        typeof node.value === "string" &&
        Array.isArray(node.tokens) &&
        Array.isArray(node.body) &&
        node.loc &&
        typeof node.loc === "object"
    ) {
        const sqlNode: SQLNode = {
            type: String(node.type),
            value: String(node.value),
            tokens: node.tokens as string[],
            body: node.body as Node[],
            loc: node.loc as Location,
        };
        return printSQLNode(sqlNode);
    }

    // For other nodes in JavaScript/TypeScript
    return "";
}

/**
 * Type guard for nodes with sqlAst property
 */
function hasSqlAst(node: Record<string, unknown>): boolean {
    return "sqlAst" in node && node.sqlAst !== null && typeof node.sqlAst === "object";
}
/**
 * Print a SQL node
 */
function printSQLNode(node: SQLNode): doc.builders.DocCommand {
    // Format the SQL AST
    return formatSQLBody(node.body);
}

/**
 * Format a SQL body
 */
function formatSQLBody(nodes: Node[]): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Process CTEs first
    const cteNodes = nodes.filter((node) => node.type === NodeType.CTE);
    if (cteNodes.length > 0) {
        parts.push("WITH");
        parts.push(" ");

        cteNodes.forEach((cte, index) => {
            if (index > 0) {
                parts.push(hardline);
                parts.push(", ");
            }

            parts.push(formatCTE(cte));
        });

        parts.push(hardline);
    }

    // Process SELECT statements
    const selectNodes = nodes.filter((node) => node.type === NodeType.Select);
    if (selectNodes.length > 0) {
        selectNodes.forEach((select, index) => {
            if (index > 0) {
                parts.push(hardline);
            }

            parts.push(formatSelect(select));
        });
    }
    return join("", parts);
}

/**
 * Format a CTE node
 */
function formatCTE(node: Node): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    parts.push(node.name || "");
    parts.push(" AS (");
    parts.push(hardline);

    // Format the body of the CTE (usually a SELECT statement)
    const body = node.body || [];
    if (body.length > 0) {
        const selectNodes = body.filter((n) => n.type === NodeType.Select);
        selectNodes.forEach((selectNode) => {
            parts.push(indent(""));
            parts.push(indent(formatSelect(selectNode)));
        });
    }

    parts.push(hardline);
    parts.push(")");

    return join("", parts);
}

/**
 * Format a SELECT statement
 */
function formatSelect(node: Node): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Format SELECT and columns
    parts.push("SELECT");

    if (node.columns && node.columns.length > 0) {
        parts.push(" ");
        parts.push(formatColumns(node.columns));
    }

    // Format FROM clause
    if (node.from) {
        parts.push(hardline);
        parts.push("FROM ");
        parts.push(node.from.toLowerCase());
    }

    // Format JOIN clauses
    if (node.joins && node.joins.length > 0) {
        node.joins.forEach((join) => {
            parts.push(hardline);
            parts.push(formatJoin(join));
        });
    }

    // Format WHERE clause
    if (node.where && node.where.length > 0) {
        parts.push(hardline);
        parts.push("WHERE ");
        parts.push(formatWhere(node.where));
    }

    return join("", parts);
}

/**
 * Format columns in a SELECT statement
 */
function formatColumns(columns: import("./types").Column[]): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    columns.forEach((column, index) => {
        let formattedColumn = column.name.toLowerCase();

        // Add alias if it exists
        if (column.alias) {
            formattedColumn += " AS " + column.alias;
        }

        if (index === 0) {
            // First column directly after SELECT
            parts.push(formattedColumn);
        } else {
            // Other columns on new lines with aligned commas
            // 5 spaces indent aligns with the 'T' in SELECT
            parts.push(hardline);
            parts.push("     , ");
            parts.push(formattedColumn);
        }
    });

    return join("", parts);
}

/**
 * Format a JOIN clause
 */
function formatJoin(node: Node): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Format join type and table
    parts.push((node.joinType || "JOIN").toUpperCase());
    parts.push(" ");
    parts.push(node.table?.toLowerCase() || "");

    // Format ON condition
    if (node.condition && node.condition.length > 0) {
        parts.push(" ON ");
        parts.push(node.condition.join(" ").toLowerCase());
    }

    return join("", parts);
}

/**
 * Format a WHERE clause
 */
function formatWhere(conditions: string[]): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Check if there are AND or OR operators
    const andOrIndices: number[] = [];
    for (let i = 0; i < conditions.length; i++) {
        if (["AND", "OR"].includes(conditions[i].toUpperCase())) {
            andOrIndices.push(i);
        }
    }

    if (andOrIndices.length === 0) {
        // Single condition
        parts.push(conditions.join(" ").toLowerCase());
        return join("", parts);
    }

    // Multiple conditions with AND/OR
    let lastIndex = 0;
    andOrIndices.forEach((index, i) => {
        // Add the condition before this AND/OR
        const condition = conditions.slice(lastIndex, index).join(" ").toLowerCase();
        if (i === 0) {
            parts.push(condition);
        } else {
            parts.push(condition);
        }

        // Add the AND/OR with proper formatting
        parts.push(hardline);
        parts.push("  "); // 2-space indent for AND/OR conditions
        parts.push(conditions[index].toUpperCase());
        parts.push(" ");

        lastIndex = index + 1;
    });

    // Add the last condition
    if (lastIndex < conditions.length) {
        const lastCondition = conditions.slice(lastIndex).join(" ").toLowerCase();
        parts.push(lastCondition);
    }

    return join("", parts);
}
