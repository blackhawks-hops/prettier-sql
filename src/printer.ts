import { doc } from "prettier";
import { SQLNode } from "./types";
import { AST, Select, Create, Update } from "node-sql-parser";

// Define our custom AST types
interface GrantAst {
    type: "grant";
    statement?: string;
    privilege?: string;
    on_type?: string;
    on_name?: string;
    in_type?: string;
    in_name?: string;
    to_type?: string;
    to_name?: string;
}

interface CustomCreate extends Create {
    view?: { view?: string };
    select?: any;
}

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
        // Use doc.builders.join to join the array of commands with hardlines
        const formattedStatements = ast.map((stmt, index) => {
            if (index > 0) {
                return join("", [hardline, formatStatement(stmt)]);
            }
            return formatStatement(stmt);
        });
        return join("", formattedStatements);
    } else if (ast && !Array.isArray(ast)) {
        return formatStatement(ast);
    }

    return "";
}

/**
 * Format a SQL statement based on its type
 */
function formatStatement(ast: AST | GrantAst | undefined, includeSemicolon: boolean = true): doc.builders.DocCommand {
    if (!ast || !ast.type) {
        return "";
    }

    switch (ast.type) {
        case "select":
            return formatSelect(ast as Select, includeSemicolon);
        case "create":
            return formatCreate(ast as Create);
        case "update":
            return formatUpdate(ast as Update, includeSemicolon);
        case "grant":
            return formatGrant(ast as GrantAst);
        default:
            // For unsupported statement types, return as is
            return "";
    }
}

/**
 * Format a CREATE statement
 */
function formatCreate(ast: CustomCreate): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];
    parts.push("CREATE ");

    // Handle OR REPLACE option
    if (ast.ignore_replace === "replace") {
        parts.push("OR REPLACE ");
    }

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

                    // Handle COMMENT attribute
                    if (def.comment) {
                        columnDefs.push(" COMMENT ");
                        // Handle nested structure from the parser
                        if (typeof def.comment === "string") {
                            columnDefs.push(`'${def.comment}'`);
                        } else if (def.comment.value && def.comment.value.type === "single_quote_string") {
                            // Handle the structure we found: {"type":"comment","value":{"type":"single_quote_string","value":"User ID"}}
                            columnDefs.push(`'${def.comment.value.value}'`);
                        } else if (def.comment.type === "single_quote_string") {
                            columnDefs.push(`'${def.comment.value}'`);
                        } else if (def.comment.value && typeof def.comment.value === "string") {
                            columnDefs.push(`'${def.comment.value}'`);
                        } else {
                            // Fallback that should not be needed now
                            columnDefs.push("''");
                        }
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
    } else if (ast.keyword === "view") {
        parts.push("VIEW ");

        // Add view name
        if (ast.view?.view) {
            parts.push(ast.view.view);
        }

        parts.push(" AS ");
        parts.push(formatSelect(ast.select, false));
    }

    parts.push(hardline);
    parts.push(";");

    return join("", parts);
}

/**
 * Format a SELECT statement
 */
function formatSelect(ast: Select, includeSemicolon: boolean = true): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];
    parts.push(hardline);

    // Handle WITH clause if present
    if (ast.with && ast.with.length > 0) {
        const withParts: doc.builders.DocCommand[] = [];

        ast.with.forEach((item: any, index: number) => {
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
    const joins = Array.isArray(ast.from) ? ast.from.filter((item: any) => item.join) : [];
    if (joins.length > 0) {
        joins.forEach((join: any) => {
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

        // Use type assertion for the properties we know exist in our actual data
        const tableItem = item as any;

        if (tableItem.table) {
            // Include database name if provided
            if (tableItem.db) {
                fromText = `${tableItem.db}.${tableItem.table}`;
            } else {
                fromText = tableItem.table;
            }

            if (tableItem.as) {
                fromText += ` ${tableItem.as}`;
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

    // Use type assertion for the properties we know exist in our actual data
    const joinItem = joinDefinition as any;

    if (joinItem.table) {
        parts.push(joinItem.table);

        if (joinItem.as) {
            parts.push(" ");
            parts.push(joinItem.as);
        }
    }

    // Format ON condition
    if (joinItem.on) {
        parts.push(" ON ");

        if (joinItem.on.type === "binary_expr") {
            parts.push(formatBinaryExpression(joinItem.on));
        } else {
            parts.push(joinItem.on.value || "");
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
        } else if (operator === "IN") {
            // Special handling for IN clause with subquery
            parts.push(" ");
            parts.push(formatExpressionValue(where.left)); // Column or expression on left side
            parts.push(" IN ");

            // Check if the right side is an expr_list containing a subquery
            if (where.right && where.right.type === "expr_list" && where.right.value && where.right.value.length > 0) {
                const subquery = where.right.value[0];
                if (subquery && subquery.ast && subquery.ast.type === "select") {
                    parts.push("(");
                    parts.push(indent(formatSelect(subquery.ast, false)));
                    parts.push(hardline);
                    parts.push(")");
                    return join("", parts);
                }
            }

            // Standard binary expression format if not a subquery
            parts.push(formatExpressionValue(where.right));
        } else {
            // Simple binary expression
            parts.push(" ");
            parts.push(formatBinaryExpression(where));
        }
    } else if (where.type === "function" && where.name?.name?.[0]?.value === "IN") {
        // Special handling for IN clause with subquery (alternative format)
        parts.push(" ");
        parts.push(formatExpressionValue(where.left)); // Column or expression on left side
        parts.push(" IN ");

        // Format the subquery
        if (where.right && where.right.ast && where.right.ast.type === "select") {
            parts.push("(");
            parts.push(indent(formatSelect(where.right.ast, false)));
            parts.push(hardline);
            parts.push(")");
        } else {
            parts.push(formatExpressionValue(where.right));
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
        // Special case for common SQL functions that don't use parentheses
        if (expr.name?.name?.[0]?.value) {
            const funcName = expr.name.name[0].value.toUpperCase();
            if (["CURRENT_DATE", "CURRENT_TIMESTAMP"].includes(funcName)) {
                return funcName;
            }
        }
        return processArg(expr); // Use processArg to handle all function cases
    } else if (expr.type === "single_quote_string") {
        return `'${expr.value}'`;
    }
    return expr.value || "";
}

/**
 * Format a GRANT statement
 */
/**
 * Format an UPDATE statement
 */
function formatUpdate(ast: Update, includeSemicolon: boolean = true): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // UPDATE keyword
    parts.push("UPDATE");

    // Table name
    if (ast.table && ast.table.length > 0) {
        parts.push(" ");
        // Use type assertion for the table properties
        const tableName = ast.table[0] as any;
        if (tableName.db) {
            parts.push(`${tableName.db}.${tableName.table}`);
        } else {
            parts.push(tableName.table);
        }
        // Add alias if provided
        if (tableName.as) {
            parts.push(" ");
            parts.push(tableName.as);
        }
    }

    // SET clause with column assignments
    if (ast.set && ast.set.length > 0) {
        parts.push(hardline);
        parts.push("   SET");

        ast.set.forEach((setItem, index) => {
            if (index === 0) {
                parts.push(" ");
            } else {
                parts.push(hardline);
                parts.push("     , ");
            }

            // Column name
            parts.push(setItem.column);
            parts.push(" = ");

            // Value
            if (setItem.value) {
                if (setItem.value.type === "function") {
                    // Special case for common SQL functions that don't use parentheses
                    if (setItem.value.name?.name?.[0]?.value) {
                        const funcName = setItem.value.name.name[0].value.toUpperCase();
                        if (["CURRENT_DATE", "CURRENT_TIMESTAMP"].includes(funcName)) {
                            parts.push(funcName);
                        } else {
                            parts.push(formatFunction(setItem.value));
                        }
                    } else {
                        parts.push(formatFunction(setItem.value));
                    }
                } else if (setItem.value.type === "column_ref") {
                    parts.push(formatColumnRef(setItem.value));
                } else if (setItem.value.type === "binary_expr") {
                    parts.push(formatBinaryExpression(setItem.value));
                } else {
                    // Other value types
                    parts.push(setItem.value.value || "");
                }
            }
        });
    }

    // WHERE clause
    if (ast.where) {
        parts.push(hardline);
        parts.push("WHERE");
        parts.push(formatWhere(ast.where));
    }

    // Semicolon
    if (includeSemicolon) {
        parts.push(hardline);
        parts.push(";");
    }

    return join("", parts);
}

/**
 * Format a GRANT statement
 */
function formatGrant(ast: GrantAst): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // If we have a simple statement property, use it directly
    if (ast.statement) {
        // Convert the statement to uppercase
        const statement = ast.statement.toUpperCase();
        parts.push(statement);
        if (!statement.endsWith(";")) {
            parts.push(";");
        }
        return join("", parts);
    }

    // Otherwise build from structured data
    parts.push("GRANT");
    parts.push(" ");

    // Add privilege
    if (ast.privilege) {
        parts.push(ast.privilege);
    }

    // Add ON clause
    if (ast.on_type) {
        parts.push(" ON ");
        parts.push(ast.on_type);
        parts.push(" ");
        parts.push(ast.on_name);
    }

    // Add IN clause if present
    if (ast.in_type) {
        parts.push(" IN ");
        parts.push(ast.in_type);
        parts.push(" ");
        parts.push(ast.in_name);
    }

    // Add TO clause
    if (ast.to_type) {
        parts.push(" TO ");
        parts.push(ast.to_type);
        parts.push(" ");
        parts.push(ast.to_name);
    }

    // Add semicolon
    parts.push(";");

    return join("", parts);
}
