import { doc } from "prettier";
import { SQLNode } from "./types";
import { AST } from "node-sql-parser";

const { join, indent, hardline } = doc.builders;

/**
 * Format SQL AST into a pretty-printed string
 */
export function print(path: { getValue: () => unknown }): doc.builders.DocCommand {
    const node = path.getValue() as SQLNode;

    if (node?.type === "sql") {
        return printSQLNode(node);
    }

    return "";
}

/**
 * Print a SQL node
 */
function printSQLNode(node: SQLNode): doc.builders.DocCommand {
    const ast = node.ast;

    if (Array.isArray(ast) && ast.length > 0) {
        // Handle multiple statements
        return join(
            hardline + hardline,
            ast.map((stmt) => formatStatement(stmt)),
        );
    } else if (!Array.isArray(ast)) {
        // Handle single statement
        return formatStatement(ast);
    }

    // Fallback if no valid AST is provided
    return "";
}

/**
 * Format a SQL statement based on its type
 */
function formatStatement(ast: AST | undefined): doc.builders.DocCommand {
    if (!ast || !ast.type) {
        return "";
    }

    switch (ast.type) {
        case "select":
            return formatSelect(ast);
        default:
            // For unsupported statement types, return as is
            return "";
    }
}

/**
 * Format a SELECT statement
 */
function formatSelect(ast: AST): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Format SELECT and columns
    parts.push("SELECT");

    if (ast.columns && Array.isArray(ast.columns)) {
        parts.push(formatColumns(ast.columns));
    }

    // Format FROM clause
    if (ast.from && Array.isArray(ast.from) && ast.from.length > 0) {
        parts.push(hardline);
        parts.push("FROM");
        parts.push(" ");
        parts.push(formatFrom(ast.from));
    }

    // Process JOIN conditions - joins are part of the from array in node-sql-parser
    const joins = ast.from?.filter((item) => item.join) || [];
    if (joins.length > 0) {
        joins.forEach((join) => {
            parts.push(hardline);
            parts.push(formatJoin(join));
        });
    }

    // Format WHERE clause
    if (ast.where) {
        parts.push(hardline);
        parts.push("WHERE");
        parts.push(formatWhere(ast.where));
    }

    // Add semicolon at the end
    parts.push(";");

    return join("", parts);
}

/**
 * Format columns in a SELECT statement
 */
function formatColumns(columns: any[]): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    columns.forEach((column, index) => {
        let formattedColumn = "";

        if (column.expr) {
            // Handle complex expressions
            if (column.expr.type === "function") {
                formattedColumn = formatFunction(column.expr);
            } else if (column.expr.type === "column_ref") {
                formattedColumn = formatColumnRef(column.expr);
            } else if (column.expr.type === "star") {
                formattedColumn = "*";
            } else {
                formattedColumn = column.expr.value || "";
            }

            // Add alias if it exists
            if (column.as) {
                formattedColumn += ` AS ${column.as}`;
            }
        }

        if (index === 0) {
            // First column directly after SELECT
            parts.push(" ");
            parts.push(formattedColumn.toUpperCase());
        } else {
            // Other columns on new lines with aligned commas
            parts.push(hardline);
            parts.push("     , ");
            parts.push(formattedColumn.toUpperCase());
        }
    });

    return join("", parts);
}

/**
 * Format a function expression
 */
function formatFunction(func: any): string {
    if (!func.name) return "";

    const funcName = func.name.toUpperCase();

    if (func.args && func.args.expr) {
        if (func.args.expr.type === "star") {
            return `${funcName}(*)`;
        } else if (func.args.expr.type === "column_ref") {
            return `${funcName}(${formatColumnRef(func.args.expr)})`;
        }
    }

    return funcName + "()";
}

/**
 * Format a column reference
 */
function formatColumnRef(columnRef: any): string {
    if (!columnRef.column) return "";

    if (columnRef.table) {
        return `${columnRef.table}.${columnRef.column}`;
    }

    return columnRef.column;
}

/**
 * Format FROM clause
 */
function formatFrom(fromItems: any[]): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Filter out join items as they'll be handled separately
    const tables = fromItems.filter((item) => !item.join);

    tables.forEach((item, index) => {
        let fromText = "";

        if (item.table) {
            fromText = item.table;

            if (item.as) {
                fromText += ` ${item.as}`;
            }
        }

        if (index > 0) {
            parts.push(", ");
        }

        parts.push(fromText);
    });

    return join("", parts);
}

/**
 * Format a JOIN clause
 */
function formatJoin(join: any): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Format join type and table
    const joinType = join.join ? join.join.toUpperCase() : "JOIN";
    parts.push(joinType);
    parts.push(" ");

    if (join.table) {
        parts.push(join.table);

        if (join.as) {
            parts.push(" ");
            parts.push(join.as);
        }
    }

    // Format ON condition
    if (join.on) {
        parts.push(" ON ");

        if (join.on.type === "binary_expr") {
            parts.push(formatBinaryExpression(join.on));
        } else {
            parts.push(join.on.value || "");
        }
    }

    return join("", parts);
}

/**
 * Format WHERE clause
 */
function formatWhere(where: any): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    if (!where) return join("", parts);

    if (where.type === "binary_expr") {
        const operator = where.operator.toUpperCase();

        if (["AND", "OR"].includes(operator)) {
            // Format complex conditions with AND/OR
            parts.push(" ");
            parts.push(formatBinaryExpressionWithIndent(where));
        } else {
            // Simple binary expression
            parts.push(" ");
            parts.push(formatBinaryExpression(where));
        }
    } else {
        parts.push(" ");
        parts.push(where.value || "");
    }

    return join("", parts);
}

/**
 * Format a binary expression
 */
function formatBinaryExpression(expr: any): string {
    if (!expr || expr.type !== "binary_expr") {
        return expr?.value || "";
    }

    const left =
        expr.left.type === "binary_expr" ? formatBinaryExpression(expr.left) : formatExpressionValue(expr.left);

    const right =
        expr.right.type === "binary_expr" ? formatBinaryExpression(expr.right) : formatExpressionValue(expr.right);

    const operator = expr.operator;

    return `${left} ${operator} ${right}`;
}

/**
 * Format binary expressions with indentation for AND/OR operators
 */
function formatBinaryExpressionWithIndent(expr: any): doc.builders.DocCommand {
    if (!expr || expr.type !== "binary_expr") {
        return expr?.value || "";
    }

    const parts: doc.builders.DocCommand[] = [];
    const operator = expr.operator.toUpperCase();

    if (["AND", "OR"].includes(operator)) {
        // Left side of the expression
        if (expr.left.type === "binary_expr" && ["AND", "OR"].includes(expr.left.operator.toUpperCase())) {
            parts.push(formatBinaryExpressionWithIndent(expr.left));
        } else {
            parts.push(formatBinaryExpression(expr.left));
        }

        // AND/OR operator and right side with indent
        parts.push(hardline);
        parts.push("  ");
        parts.push(operator);
        parts.push(" ");

        if (expr.right.type === "binary_expr" && ["AND", "OR"].includes(expr.right.operator.toUpperCase())) {
            parts.push(formatBinaryExpression(expr.right.left));
            parts.push(hardline);
            parts.push("  ");
            parts.push(expr.right.operator.toUpperCase());
            parts.push(" ");
            parts.push(formatExpressionValue(expr.right.right));
        } else {
            parts.push(formatBinaryExpression(expr.right));
        }
    } else {
        // Simple binary expression
        parts.push(formatBinaryExpression(expr));
    }

    return join("", parts);
}

/**
 * Format an expression value
 */
function formatExpressionValue(expr: any): string {
    if (!expr) return "";

    if (expr.type === "column_ref") {
        return formatColumnRef(expr);
    } else if (expr.type === "string") {
        return `'${expr.value.toLowerCase()}'`;
    } else if (expr.type === "number") {
        return expr.value.toString();
    } else if (expr.type === "function") {
        return formatFunction(expr);
    }

    return expr.value || "";
}
