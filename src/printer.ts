import { doc } from "prettier";
import { SQLNode } from "./types";
import { AST } from "node-sql-parser";

const { join, hardline, indent } = doc.builders;

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
        return ast.map((stmt, index) => {
            if (index > 0) {
                return join("", [hardline, formatStatement(stmt)]);
            }
            return formatStatement(stmt);
        });
    } else {
        return formatStatement(ast);
    }

    return "";
}

/**
 * Format a SQL statement based on its type
 */
function formatStatement(ast: AST | undefined, includeSemicolon: boolean = true): doc.builders.DocCommand {
    if (!ast || !ast.type) {
        return "";
    }

    switch (ast.type) {
        case "select":
            return formatSelect(ast, includeSemicolon);
        case "create":
            return formatCreate(ast);
        default:
            // For unsupported statement types, return as is
            return "";
    }
}

/**
 * Format a CREATE statement
 */
function formatCreate(ast: AST): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];
    parts.push("CREATE ");

    // Handle table creation
    if (ast.keyword === "table") {
        parts.push("TABLE ");

        // Add table name
        if (ast.table && ast.table.length > 0) {
            const tableName = ast.table[0].table;
            if (tableName) {
                parts.push(tableName);
            }
        }

        // Add column definitions
        if (ast.create_definitions && ast.create_definitions.length > 0) {
            parts.push(" (");

            // Create column definitions with proper indentation
            const columnDefs: doc.builders.DocCommand[] = [];

            ast.create_definitions.forEach((def: any, index: number) => {
                columnDefs.push(hardline);
                columnDefs.push(index > 0 ? ", " : "  ");

                // Column name
                if (def.column && def.column.column) {
                    columnDefs.push(def.column.column);
                }

                // Data type
                if (def.definition) {
                    columnDefs.push(" ");
                    columnDefs.push(def.definition.dataType);

                    // Handle length/precision
                    if (def.definition.length && def.definition.parentheses) {
                        if (def.definition.scale !== undefined) {
                            // For types like DECIMAL that have precision and scale
                            columnDefs.push(`(${def.definition.length},${def.definition.scale})`);
                        } else {
                            columnDefs.push(`(${def.definition.length})`);
                        }
                    }

                    // Handle primary key constraint
                    if (def.primary_key) {
                        columnDefs.push(" PRIMARY KEY");
                    }

                    // Handle foreign key constraint using reference_definition
                    if (def.reference_definition) {
                        columnDefs.push(" REFERENCES ");

                        // Handle table name
                        if (
                            def.reference_definition.table &&
                            def.reference_definition.table.length > 0 &&
                            def.reference_definition.table[0].table
                        ) {
                            columnDefs.push(def.reference_definition.table[0].table);

                            // Handle column reference
                            if (
                                def.reference_definition.definition &&
                                def.reference_definition.definition.length > 0 &&
                                def.reference_definition.definition[0].column
                            ) {
                                columnDefs.push(`(${def.reference_definition.definition[0].column})`);
                            }
                        }
                    }
                }
            });

            // Add the indented column definitions to the parts array
            parts.push(indent(join("", columnDefs)));
            parts.push(hardline);
            parts.push(")");
        }
    }

    parts.push(hardline);
    parts.push(";");

    return join("", parts);
}

/**
 * Format a SELECT statement
 */
function formatSelect(ast: AST, includeSemicolon: boolean = true): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];
    parts.push(hardline);

    // Handle WITH clause if present
    if (ast.with && ast.with.length > 0) {
        const withParts: doc.builders.DocCommand[] = [];

        ast.with.forEach((item, index) => {
            if (index === 0) {
                withParts.push("WITH ");
            } else {
                withParts.push(hardline);
                withParts.push(", ");
            }

            if (item.name?.value) {
                withParts.push(item.name.value);
                if (item.stmt?.ast) {
                    withParts.push(" AS (");
                    withParts.push(indent(formatStatement(item.stmt.ast, false)));
                    withParts.push(hardline);
                    withParts.push(")");
                }
            }
        });

        parts.push(join("", withParts));
        parts.push(hardline);
    }

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

    if (includeSemicolon) {
        parts.push(hardline);
        parts.push(";");
    }
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
            } else if (column.expr.type === "aggr_func") {
                formattedColumn = formatAggregationFunction(column.expr);
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
            parts.push(formattedColumn);
        } else {
            // Other columns on new lines with aligned commas
            parts.push(hardline);
            parts.push("     , ");
            parts.push(formattedColumn);
        }
    });

    return join("", parts);
}

/**
 * Format a function expression
 */
function formatFunction(func: any): string {
    if (!func.name) return "";

    let funcName;

    // Handle complex name structure
    if (typeof func.name === "object" && func.name.name && Array.isArray(func.name.name)) {
        funcName = func.name.name[0]?.value || "";
    } else {
        funcName = func.name;
    }

    funcName = funcName.toUpperCase();

    // Handle expr_list arguments structure
    if (func.args && func.args.type === "expr_list" && Array.isArray(func.args.value)) {
        const args = func.args.value.map(processArg);
        return `${funcName}(${args.join(", ")})`;
    }

    // Handle standard args.expr structure
    if (func.args && func.args.expr) {
        if (func.args.expr.type === "star") {
            return `${funcName}(*)`;
        } else if (func.args.expr.type === "column_ref") {
            return `${funcName}(${formatColumnRef(func.args.expr)})`;
        } else {
            return `${funcName}(${processArg(func.args.expr)})`;
        }
    }

    return funcName + "()";
}

function processArg(arg: any): string {
    if (arg.type === "function") {
        // Handle function with complex name structure
        if (arg.name && typeof arg.name === "object" && arg.name.name && Array.isArray(arg.name.name)) {
            // Extract function name from the complex structure and convert to uppercase
            const funcName = (arg.name.name[0]?.value || "").toUpperCase();

            // Handle function arguments
            if (arg.args && arg.args.type === "expr_list" && Array.isArray(arg.args.value)) {
                const processedArgs = arg.args.value.map(processArg);
                return `${funcName}(${processedArgs.join(", ")})`;
            }

            return `${funcName}()`;
        }

        return formatFunction(arg);
    } else if (arg.type === "column_ref") {
        return formatColumnRef(arg);
    } else if (arg.type === "number") {
        return arg.value.toString();
    } else if (arg.type === "single_quote_string") {
        return `'${arg.value}'`;
    }
    return arg.value || "";
}

/**
 * Format an aggregation function
 */
function formatAggregationFunction(func: any): string {
    if (!func.name) return "";

    const funcName = func.name.toUpperCase();

    if (Array.isArray(func.args)) {
        const args = func.args.map((arg: any) => {
            return processArg(arg);
        });
        return `${funcName}(${args.join(", ")})`;
    } else if (func.args?.expr) {
        const arg = processArg(func.args?.expr);
        return `${funcName}(${arg})`;
    }

    return `${funcName}()`;
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
function formatJoin(joinDefinition: any): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // Format join type and table
    const joinType = joinDefinition.join ? joinDefinition.join.toUpperCase() : "JOIN";
    parts.push(joinType);
    parts.push(" ");

    if (joinDefinition.table) {
        parts.push(joinDefinition.table);

        if (joinDefinition.as) {
            parts.push(" ");
            parts.push(joinDefinition.as);
        }
    }

    // Format ON condition
    if (joinDefinition.on) {
        parts.push(" ON ");

        if (joinDefinition.on.type === "binary_expr") {
            parts.push(formatBinaryExpression(joinDefinition.on));
        } else {
            parts.push(joinDefinition.on.value || "");
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
    } else if (expr.type === "number") {
        return expr.value.toString();
    } else if (expr.type === "function") {
        return processArg(expr); // Use processArg to handle all function cases
    } else if (expr.type === "single_quote_string") {
        return `'${expr.value}'`;
    }
    return expr.value || "";
}
