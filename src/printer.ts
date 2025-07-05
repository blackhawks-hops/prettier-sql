import { doc } from "prettier";
import { Node, NodeType, SQLNode } from "./types";

const { join, indent, hardline } = doc.builders;

/**
 * Format SQL AST into a pretty-printed string
 */
export function print(path: { getValue: () => unknown }): doc.builders.DocCommand {
    const node = path.getValue();

    // If this is a SQL node from a template literal, format it
    if (node.sqlAst) {
        // Add a newline after the backtick for template literals
        return [hardline, printSQLNode(node.sqlAst)];
    }

    // Format a SQL file
    if (node.type === "sql") {
        return printSQLNode(node);
    }

    // For other nodes in JavaScript/TypeScript
    return "";
}

/**
 * Print a SQL node
 */
function printSQLNode(node: SQLNode): doc.builders.DocCommand {
    // Format the SQL AST
    const formattedSql = formatSQLBody(node.body);

    return formattedSql;
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
                parts.push(",");
                parts.push(hardline);
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

    // Add semicolon at the end
    parts.push(";");

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
        const selectText = body
            .map((token) => {
                if (token.type === NodeType.Token) {
                    return token.value || "";
                }
                return "";
            })
            .join(" ");

        // Re-parse the select text to format it properly
        const selectTokens = selectText.split(" ");
        const selectAst: Node[] = [];

        // Very simplistic parsing for demo purposes
        let i = 0;
        while (i < selectTokens.length) {
            if (selectTokens[i].toUpperCase() === "SELECT") {
                const selectNode: Node = {
                    type: NodeType.Select,
                    columns: [],
                    from: "",
                    joins: [],
                    where: [],
                };

                i++;
                // Parse columns
                while (i < selectTokens.length && selectTokens[i].toUpperCase() !== "FROM") {
                    if (selectTokens[i] !== ",") {
                        selectNode.columns.push(selectTokens[i]);
                    }
                    i++;
                }

                // Parse FROM
                if (i < selectTokens.length && selectTokens[i].toUpperCase() === "FROM") {
                    i++;
                    selectNode.from = selectTokens[i];
                    i++;
                }

                // Parse WHERE
                if (i < selectTokens.length && selectTokens[i].toUpperCase() === "WHERE") {
                    i++;
                    while (i < selectTokens.length) {
                        selectNode.where.push(selectTokens[i]);
                        i++;
                    }
                }

                selectAst.push(selectNode);
            } else {
                i++;
            }
        }

        parts.push(indent([formatSelect(selectAst[0])]));
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
function formatColumns(columns: string[]): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    columns.forEach((column, index) => {
        if (index === 0) {
            // First column on the same line as SELECT
            parts.push(column.toLowerCase());
        } else {
            // Other columns aligned with 5-space indent (aligns with the 'T' in SELECT)
            parts.push(hardline);
            parts.push(", ");
            parts.push(column.toLowerCase());
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
            parts.push(" ");
            parts.push(condition);
        }

        // Add the AND/OR with proper formatting
        parts.push(hardline);
        parts.push(conditions[index].toUpperCase());
        parts.push(" ");

        lastIndex = index + 1;
    });

    // Add the last condition
    if (lastIndex < conditions.length) {
        const lastCondition = conditions.slice(lastIndex).join(" ").toLowerCase();
        parts.push(lastCondition);
    }

    // Indent all lines after the first to align with the first condition
    return join("", [parts[0], indent([join("", parts.slice(1))])]);
}
