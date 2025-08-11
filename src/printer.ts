import { doc } from "prettier";
import { SQLNode } from "./types";
import { AST, Select, Create, Update, Delete, TableExpr } from "node-sql-parser";
import { SQLParser } from "./parser";

// Define our custom AST types
interface GrantAst {
    type: "grant" | "comment" | "raw";
    statement?: string;
    privilege?: string;
    on_type?: string;
    on_name?: string;
    in_type?: string;
    in_name?: string;
    to_type?: string;
    to_name?: string;
    text?: string;
    value?: string;
}

interface CustomCreate extends Create {
    view?: { view?: string; db?: string };
    select?: any;
    schema?: {
        schema?: Array<{ value: string }>;
    };
    target_lag?: string;
    warehouse?: string;
    refresh_mode?: string;
    initialize?: string;
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
        // Format all statements
        const formattedStatements = ast.map((stmt) => formatStatement(stmt));

        // Join statements with appropriate spacing based on statement types
        const result: doc.builders.DocCommand[] = [formattedStatements[0]];

        for (let i = 1; i < formattedStatements.length; i++) {
            const prevStmt = ast[i - 1];
            const currStmt = ast[i];

            // Add blank line between statements based on their types
            if (shouldAddBlankLine(prevStmt, currStmt)) {
                result.push(hardline);
                result.push(hardline);
            } else {
                result.push(hardline);
            }

            result.push(formattedStatements[i]);
        }

        return join("", result);
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
        case "delete":
            return formatDelete(ast as Delete, includeSemicolon);
        case "insert":
            return formatInsert(ast as any, includeSemicolon);
        case "grant":
            return formatGrant(ast as GrantAst);
        case "comment":
            // Handle comment nodes by returning their text content
            return (ast as any).value || (ast as GrantAst).text || "";
        case "raw":
            return (ast as GrantAst).value || "";
        default:
            // For unsupported statement types, return as is
            // Check if the ast can be treated as a raw type
            const astAny = ast as any;
            if (astAny && astAny.type === "raw" && astAny.value !== undefined) {
                return astAny.value;
            }

            return "";
    }
}

// Old restoreInlineComments function removed - all comments now attached directly to AST nodes

/**
 * Helper function to restore block comments from placeholders
 */
function restoreBlockComments(statement: any): doc.builders.DocCommand[] {
    const parts: doc.builders.DocCommand[] = [];

    if (statement.block_comments && statement.block_comments.length > 0) {
        statement.block_comments.forEach((commentInfo: any) => {
            parts.push(hardline);
            // Format multiline comments with proper indentation
            const commentLines = commentInfo.comment.split("\n");
            if (commentLines.length > 1) {
                // Multi-line comment
                parts.push(commentLines[0]); // /* This is a comment
                for (let i = 1; i < commentLines.length; i++) {
                    parts.push(hardline);
                    // Indent continuation lines including the closing */
                    parts.push("   " + commentLines[i].trim());
                }
            } else {
                // Single line comment
                parts.push(commentInfo.comment);
            }
        });
    }

    return parts;
}

/**
 * Format a CREATE statement
 */
function formatCreate(ast: CustomCreate): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];
    parts.push("CREATE ");

    // Handle OR REPLACE option
    if (ast.ignore_replace === "replace" || (ast as any).replace === "or replace") {
        parts.push("OR REPLACE ");
    }

    // Handle schema creation
    if (ast.keyword === "schema") {
        parts.push("SCHEMA ");

        // Add schema name
        if (ast.schema && ast.schema.schema && ast.schema.schema.length > 0) {
            parts.push(ast.schema.schema[0].value);
            // Add semicolon right after schema name, without newline
            parts.push(";");
            // Return early since we've already added the semicolon
            return join("", parts);
        }
    }
    // Handle table creation
    else if (ast.keyword === "table") {
        parts.push("TABLE ");

        // Add table name
        if (ast.table && ast.table.length > 0) {
            const tableRef = ast.table[0];

            // Include schema/database name if available (all lowercase)
            if (tableRef.db) {
                // Handle specific schema name transformation
                let schemaName = tableRef.db.toLowerCase();
                parts.push(`${schemaName}.${tableRef.table.toLowerCase()}`);
            } else if (tableRef.table) {
                parts.push(tableRef.table.toLowerCase());
            }
        }

        // Handle LIKE clause for CREATE TABLE ... LIKE ...
        if (ast.like && ast.like.table && Array.isArray(ast.like.table) && ast.like.table.length > 0) {
            parts.push(" LIKE ");
            const likeTable = ast.like.table[0];
            if (likeTable.db) {
                parts.push(`${likeTable.db}.${likeTable.table}`);
            } else {
                parts.push(likeTable.table);
            }
        }

        // Add column definitions with aligned types
        if (ast.create_definitions && ast.create_definitions.length > 0) {
            parts.push(" (");

            // Filter out non-column definitions (like table constraints)
            const columnDefinitions = ast.create_definitions.filter(
                (def: any) => def.column && def.column.column && def.definition
            );

            // First pass: find maximum column name length for alignment (using lowercase)
            let maxColumnNameLength = 0;
            columnDefinitions.forEach((def: any) => {
                maxColumnNameLength = Math.max(maxColumnNameLength, def.column.column.toLowerCase().length);
            });

            // Create column definitions with proper indentation and alignment
            const columnDefs: doc.builders.DocCommand[] = [];

            columnDefinitions.forEach((def: any, index: number) => {
                // Handle leading comments (comments before this column)
                if (def.leadingComments && def.leadingComments.length > 0) {
                    def.leadingComments.forEach((comment: string) => {
                        columnDefs.push(hardline);
                        columnDefs.push("-- ");
                        columnDefs.push(comment);
                    });
                }

                columnDefs.push(hardline);
                columnDefs.push(index > 0 ? ", " : "  ");

                // Column name with padding for alignment (lowercase)
                const columnName = def.column.column.toLowerCase();
                const padding = " ".repeat(Math.max(0, maxColumnNameLength - columnName.length));
                columnDefs.push(columnName + padding);

                // Data type
                if (def.definition) {
                    columnDefs.push(" ");

                    // Build complete data type string first
                    let completeDataType = def.definition.dataType;

                    // Handle length/precision
                    if (def.definition.length && def.definition.parentheses) {
                        if (def.definition.scale !== undefined) {
                            // For types like DECIMAL that have precision and scale
                            completeDataType += `(${def.definition.length},${def.definition.scale})`;
                        } else {
                            completeDataType += `(${def.definition.length})`;
                        }
                    }

                    // Check for attached trailing comment on this column definition
                    if (def.trailingComment) {
                        // Check if comment already starts with -- to avoid duplication
                        if (def.trailingComment.startsWith("--")) {
                            completeDataType += ` ${def.trailingComment}`;
                        } else {
                            completeDataType += ` -- ${def.trailingComment}`;
                        }
                    }

                    columnDefs.push(completeDataType);

                    // Handle primary key constraint
                    if (def.primary_key) {
                        columnDefs.push(" PRIMARY KEY");
                    }

                    // Handle NOT NULL constraint
                    if (def.definition.nullable === false) {
                        columnDefs.push(" NOT NULL");
                    }

                    // Handle NOT NULL constraint
                    if (def.nullable && def.nullable.value === "not null") {
                        columnDefs.push(" NOT NULL");
                    }

                    // Handle DEFAULT value
                    if (def.default_val) {
                        columnDefs.push(" DEFAULT ");

                        // Handle different default value types
                        if (def.default_val.value && def.default_val.value.type === "function") {
                            // For function calls like CURRENT_TIMESTAMP()
                            // Extract function name and convert to uppercase
                            let funcName = "";
                            if (typeof def.default_val.value.name === "string") {
                                funcName = def.default_val.value.name.toUpperCase();
                            } else if (
                                def.default_val.value.name?.name &&
                                Array.isArray(def.default_val.value.name.name)
                            ) {
                                // Handle complex function name structure
                                funcName = (def.default_val.value.name.name[0]?.value || "").toUpperCase();
                            }

                            if (def.default_val.value.args) {
                                columnDefs.push(`${funcName}()`);
                            } else {
                                columnDefs.push(funcName);
                            }
                        } else if (def.default_val.value && def.default_val.value.type === "bool") {
                            // Handle boolean values
                            columnDefs.push(def.default_val.value.value === true ? "TRUE" : "FALSE");
                        } else if (def.default_val.value && typeof def.default_val.value === "string") {
                            // For string literals
                            columnDefs.push(`'${def.default_val.value}'`);
                        } else if (def.default_val.value && def.default_val.value.value) {
                            // For structured values
                            if (
                                typeof def.default_val.value.value === "object" &&
                                def.default_val.value.value.type === "bool"
                            ) {
                                // Handle boolean objects that ended up in nested structure
                                columnDefs.push(def.default_val.value.value.value ? "TRUE" : "FALSE");
                            } else {
                                columnDefs.push(String(def.default_val.value.value));
                            }
                        } else {
                            // Fallback
                            columnDefs.push(String(def.default_val.value || ""));
                        }
                    }

                    // Handle DEFAULT value
                    if (def.definition.default_val) {
                        columnDefs.push(" DEFAULT ");

                        // Handle different default value types
                        if (typeof def.definition.default_val === "string") {
                            columnDefs.push(def.definition.default_val.toUpperCase());
                        } else if (def.definition.default_val.type === "function") {
                            // Format function call for DEFAULT
                            const funcName = def.definition.default_val.name.toUpperCase();
                            if (def.definition.default_val.args && def.definition.default_val.args.length > 0) {
                                columnDefs.push(`${funcName}(${def.definition.default_val.args.join(", ")})`);
                            } else {
                                columnDefs.push(`${funcName}()`);
                            }
                        } else if (
                            def.definition.default_val.value &&
                            def.definition.default_val.value.type === "bool"
                        ) {
                            // Handle boolean values
                            columnDefs.push(def.definition.default_val.value.value === true ? "TRUE" : "FALSE");
                        } else {
                            columnDefs.push(String(def.definition.default_val.value || ""));
                        }
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

            // Handle table-level constraints (like compound primary keys)
            if (ast.create_definitions) {
                ast.create_definitions.forEach((def: any) => {
                    if (def.resource === "constraint" && def.constraint_type === "primary key") {
                        columnDefs.push(hardline);
                        columnDefs.push(", PRIMARY KEY (");

                        // Handle the column list for compound primary key
                        if (def.definition && Array.isArray(def.definition)) {
                            const keyColumns = def.definition.map((col: any) => {
                                if (typeof col === "string") {
                                    return col.toLowerCase();
                                } else if (col.column) {
                                    return col.column.toLowerCase();
                                }
                                return col;
                            });
                            columnDefs.push(keyColumns.join(", "));
                        }

                        columnDefs.push(")");
                    }
                });
            }

            // Add the indented column definitions to the parts array
            parts.push(indent(join("", columnDefs)));
            parts.push(hardline);
            parts.push(")");
        }

        // Handle table options (e.g., COMMENT)
        if (ast.table_options && Array.isArray(ast.table_options)) {
            ast.table_options.forEach((option: any) => {
                if (option.keyword === "comment") {
                    parts.push(hardline);
                    parts.push("COMMENT = ");
                    // The value already includes quotes, so use it directly
                    parts.push(option.value);
                }
            });
        }
    }
    // Handle view creation
    else if (ast.keyword === "view") {
        parts.push("VIEW ");

        // Include schema/database name if available
        if (ast.view && ast.view.db) {
            parts.push(`${ast.view.db.toLowerCase()}.${ast.view.view.toLowerCase() || ""}`);
        } else if (ast.view && ast.view.view) {
            parts.push(ast.view.view);
        }

        parts.push(" AS");
        parts.push([hardline, formatSelect(ast.select, false)]);
    }
    // Handle dynamic table creation
    else if ((ast.keyword as string) === "dynamic_table") {
        parts.push("DYNAMIC TABLE ");

        // Include schema/database name if available
        if (ast.view && ast.view.db) {
            parts.push(`${ast.view.db}.${ast.view.view || ""}`);
        } else if (ast.view && ast.view.view) {
            parts.push(ast.view.view);
        }

        // Add TARGET_LAG parameter
        if (ast.target_lag) {
            parts.push([hardline, `TARGET_LAG = '${ast.target_lag}'`]);
        }

        // Add REFRESH_MODE parameter
        if (ast.refresh_mode) {
            parts.push([hardline, `REFRESH_MODE = ${ast.refresh_mode}`]);
        }

        // Add INITIALIZE parameter
        if (ast.initialize) {
            parts.push([hardline, `INITIALIZE = ${ast.initialize}`]);
        }

        // Add WAREHOUSE parameter
        if (ast.warehouse) {
            parts.push([hardline, `WAREHOUSE = ${ast.warehouse}`]);
        }

        parts.push([hardline, "AS"]);
        parts.push([hardline, formatSelect(ast.select, false)]);
    }

    // We don't add a hardline for schema creation
    if (ast.keyword !== "schema") {
        parts.push(hardline);
    }
    parts.push(";");

    return join("", parts);
}

/**
 * Format a SELECT statement
 */
function formatSelect(ast: Select, includeSemicolon: boolean = true): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

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

                    // Check if this CTE has a stored QUALIFY clause
                    const storedQualify = SQLParser.getStoredQualify(item.name.value);
                    if (storedQualify) {
                        // Add the QUALIFY clause to the AST before formatting
                        const cteAst = item.stmt.ast as any;
                        if (!cteAst.qualify) {
                            cteAst.qualify = storedQualify;
                        }
                    }

                    const cteContent = formatStatement(item.stmt.ast, false);
                    withParts.push(indent([hardline, cteContent]));
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
        parts.push(formatColumns(ast.columns, ast));
    }

    // Format FROM clause
    if (ast.from && Array.isArray(ast.from) && ast.from.length > 0) {
        parts.push(hardline);
        parts.push("FROM");
        parts.push(" ");

        // Check if we have a subquery in the FROM clause
        if ((ast.from[0] as TableExpr)?.expr) {
            // Handle subquery in FROM
            parts.push("(");
            if ((ast.from[0] as TableExpr).expr.ast && (ast.from[0] as TableExpr).expr.ast.type === "select") {
                parts.push(indent([hardline, formatSelect((ast.from[0] as TableExpr).expr.ast, false)]));
                parts.push(hardline);
            }
            parts.push(")");

            // Add alias if it exists
            if ((ast.from[0] as TableExpr).as) {
                parts.push(" ");
                parts.push((ast.from[0] as TableExpr).as);
            }
        } else {
            parts.push(formatFrom(ast.from));
        }
    }

    // Process JOIN conditions - joins are part of the from array in node-sql-parser
    const joins = Array.isArray(ast.from) ? ast.from.filter((item: any) => item.join) : [];
    if (joins.length > 0) {
        joins.forEach((join: any) => {
            parts.push(hardline);
            parts.push(formatJoin(join));
        });
    }

    // Add block comments (between FROM/JOIN and WHERE)
    const blockCommentParts = restoreBlockComments(ast);
    if (blockCommentParts.length > 0) {
        parts.push(...blockCommentParts);
    }

    // Format WHERE clause
    if (ast.where) {
        parts.push(hardline);
        parts.push("WHERE");
        parts.push(formatWhere(ast.where, ast));
    }

    // Format GROUP BY clause
    if ((ast.groupby as any) === "ALL") {
        // Handle GROUP BY ALL
        parts.push(hardline);
        parts.push("GROUP BY ALL");
    } else if (Array.isArray(ast.groupby?.columns)) {
        parts.push(hardline);
        parts.push(`GROUP BY ${ast.groupby.columns.map((item: any) => item.value || item.column || "").join(", ")}`);
    }

    // Format HAVING clause
    if (ast.having) {
        parts.push(hardline);
        parts.push("HAVING");
        parts.push(formatWhere(ast.having, ast));
    }

    // Format QUALIFY clause (for regular QUALIFY clauses not in comments)
    if (ast.qualify) {
        parts.push(hardline);
        parts.push("QUALIFY ");
        // Format the QUALIFY expression - handle common patterns
        const qualifyText = typeof ast.qualify === "string" ? ast.qualify : String(ast.qualify);
        const formattedQualify = qualifyText
            .replace(/\brow_number\(\)/gi, "ROW_NUMBER()")
            .replace(/\bover\s*\(/gi, "OVER (")
            .replace(/\bpartition\s+by\b/gi, "PARTITION BY")
            .replace(/\border\s+by\b/gi, "ORDER BY")
            .replace(/\b(asc|desc)\b/gi, (match: string) => match.toUpperCase());
        parts.push(formattedQualify);
    }

    // Format ORDER BY clause
    if (ast.orderby && Array.isArray(ast.orderby) && ast.orderby.length > 0) {
        parts.push(hardline);
        parts.push("ORDER BY");

        const orderParts: string[] = [];
        ast.orderby.forEach((item: any) => {
            let orderStr = "";

            if (item.expr) {
                if (item.expr.type === "column_ref") {
                    orderStr = formatColumnRef(item.expr);
                } else if (item.expr.type === "function") {
                    orderStr = formatFunction(item.expr, ast);
                } else if (item.expr.type === "aggr_func") {
                    orderStr = formatAggregationFunction(item.expr);
                } else {
                    orderStr = formatExpressionValue(item.expr, ast) || item.expr.value || "";
                }
            }

            if (item.type) {
                orderStr += ` ${item.type}`;
            }

            orderParts.push(orderStr);
        });

        parts.push(" ");
        parts.push(orderParts.join(", "));
    }

    // Format LIMIT clause
    if (ast.limit) {
        parts.push(hardline);
        parts.push("LIMIT");

        if (ast.limit.value && Array.isArray(ast.limit.value) && ast.limit.value.length > 0) {
            parts.push(" ");
            const limitValues = ast.limit.value.map((item: any) => {
                if (item.type === "number") {
                    return item.value.toString();
                }
                return item.value || "";
            });

            parts.push(limitValues.join(", "));
        }
    }

    // Handle UNION operations
    if ((ast as any).set_op && (ast as any)._next) {
        parts.push(hardline);
        parts.push((ast as any).set_op.toUpperCase());

        // Format the next SELECT statement
        parts.push([hardline, formatSelect((ast as any)._next, false)]);
    }

    if (includeSemicolon) {
        parts.push(hardline);
        parts.push(";");
    }

    return join("", parts);
}

/**
 * Format an INSERT statement
 */
function formatInsert(ast: any, includeSemicolon: boolean = true): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // INSERT INTO keyword
    parts.push("INSERT INTO");

    // Table name
    if (ast.table && Array.isArray(ast.table) && ast.table.length > 0) {
        const table = ast.table[0] as any;
        parts.push(" ");
        if (table.db) {
            parts.push(`${table.db}.${table.table}`);
        } else {
            parts.push(table.table);
        }
    }

    // Column list (optional)
    if (ast.columns && Array.isArray(ast.columns)) {
        const hasCTE = ast.values && (ast.values as any).with && Array.isArray((ast.values as any).with);

        if (ast.columns.length <= 2 && !hasCTE) {
            // Short column list on same line (only if no CTE)
            parts.push(" (");
            parts.push(ast.columns.join(", "));
            parts.push(")");
        } else {
            // Long column list with indentation
            parts.push(" (");
            parts.push(hardline);
            parts.push("      ");

            const columnParts: doc.builders.DocCommand[] = [];
            ast.columns.forEach((column: string, index: number) => {
                if (index > 0) {
                    columnParts.push(hardline);
                    columnParts.push("    , ");
                }
                columnParts.push(column);
            });

            parts.push(join("", columnParts));
            parts.push(hardline);
            parts.push(")");
        }
    }

    // Handle VALUES clause or SELECT statement
    if (ast.values) {
        if (ast.values.type === "select") {
            // Format the SELECT statement without semicolon
            parts.push([hardline, formatSelect(ast.values as Select, false)]);
        } else if (Array.isArray(ast.values)) {
            // Handle VALUES clause with multiple value tuples
            parts.push(hardline);
            parts.push("VALUES ");

            ast.values.forEach((valueRow: any, index: number) => {
                if (index > 0) {
                    parts.push(hardline);
                    parts.push("     , ");
                }

                parts.push("(");

                // Handle expr_list structure: valueRow = {type: "expr_list", value: [array of values]}
                if (valueRow && valueRow.type === "expr_list" && Array.isArray(valueRow.value)) {
                    valueRow.value.forEach((value: any, valueIndex: number) => {
                        if (valueIndex > 0) {
                            parts.push(", ");
                        }

                        // Format individual values based on their type
                        if (value === null || value === undefined) {
                            parts.push("NULL");
                        } else if (value && typeof value === "object") {
                            if (value.type === "single_quote_string") {
                                parts.push(`'${value.value}'`);
                            } else if (value.type === "number") {
                                parts.push(value.value.toString());
                            } else if (value.type === "function") {
                                // Handle function calls like CURRENT_TIMESTAMP()
                                parts.push(formatFunction(value));
                            } else if (value.value !== undefined) {
                                // Fallback for other structured values
                                if (typeof value.value === "string") {
                                    parts.push(`'${value.value}'`);
                                } else {
                                    parts.push(String(value.value));
                                }
                            } else {
                                parts.push(String(value));
                            }
                        } else if (typeof value === "string") {
                            parts.push(`'${value}'`);
                        } else if (typeof value === "number") {
                            parts.push(value.toString());
                        } else {
                            parts.push(String(value));
                        }
                    });
                }

                parts.push(")");
            });
        }
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
function formatColumns(columns: any[], statement?: any): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    columns.forEach((column, index) => {
        let formattedColumn = "";

        if (column.expr) {
            // Handle complex expressions
            if (column.expr.type === "function") {
                // Check if this is an array access function
                const funcName =
                    typeof column.expr.name === "string" ? column.expr.name : column.expr.name?.name?.[0]?.value || "";
                const arrayRegex = /^__ARRAYACCESS__(\d+)__(.+)$/;
                const match = funcName.match(arrayRegex);
                if (match) {
                    const arrayIndex = match[1];
                    const functionName = match[2].toUpperCase();

                    formattedColumn = `${functionName}(${column.expr.args?.value.map((arg: any) => processArg(arg, statement)).join(", ")})[${arrayIndex}]`;
                } else {
                    formattedColumn = formatFunction(column.expr, statement);
                }
            } else if (column.expr.type === "aggr_func") {
                formattedColumn = formatAggregationFunction(column.expr);
            } else if (column.expr.type === "column_ref") {
                formattedColumn = formatColumnRef(column.expr);
            } else if (column.expr.type === "star") {
                formattedColumn = "*";
            } else if (column.expr.type === "number") {
                formattedColumn = column.expr.value.toString();
            } else if (column.expr.type === "binary_expr") {
                formattedColumn = formatBinaryExpression(column.expr, statement);
            } else if (column.expr.type === "case") {
                formattedColumn = formatCaseExpression(column.expr, statement);
            } else if (column.expr.type === "cast") {
                formattedColumn = formatCastExpression(column.expr, statement);
            } else if (column.expr.type === "single_quote_string") {
                // Handle boolean objects that ended up as string literals
                if (typeof column.expr.value === "object" && column.expr.value.type === "bool") {
                    formattedColumn = column.expr.value.value ? "TRUE" : "FALSE";
                } else {
                    formattedColumn = `'${column.expr.value}'`;
                }
            } else if (column.expr.type === "bool") {
                formattedColumn = column.expr.value ? "TRUE" : "FALSE";
            } else {
                formattedColumn = String(column.expr.value || "");
            }

            // Add alias if it exists
            if (column.as) {
                formattedColumn += ` AS ${column.as}`;
            }
        }

        // Handle leading comments (comments before this column)
        if (column.leadingComments && column.leadingComments.length > 0) {
            column.leadingComments.forEach((comment: string) => {
                parts.push(hardline);
                parts.push("     -- ");
                parts.push(comment);
            });
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

        // Handle trailing comments (inline comments after this column)
        if (column.trailingComment) {
            parts.push(" -- ");
            parts.push(column.trailingComment);
        }
    });

    return join("", parts);
}

/**
 * Format a function expression
 */
function formatFunction(func: any, statement?: any): string {
    if (!func.name) return "";

    let funcName;

    // Handle complex name structure
    if (typeof func.name === "object" && func.name.name && Array.isArray(func.name.name)) {
        funcName = func.name.name[0]?.value || "";
    } else {
        funcName = func.name;
    }

    funcName = funcName.toUpperCase();

    // Check if this is a COALESCE placeholder for GREATEST/LEAST functions
    if (
        funcName === "COALESCE" &&
        statement?.greatest_least_functions &&
        Array.isArray(statement.greatest_least_functions)
    ) {
        // Check if the first argument is a placeholder
        if (
            func.args &&
            func.args.type === "expr_list" &&
            Array.isArray(func.args.value) &&
            func.args.value.length > 0
        ) {
            const firstArg = func.args.value[0];
            if (firstArg && firstArg.type === "column_ref" && firstArg.column) {
                const argValue = firstArg.column;
                // Look for our placeholder pattern: __GREATEST_N__, __LEAST_N__, __GREATEST_IGNORE_NULLS_N__, etc.
                const placeholderMatch = argValue.match(/^__([A-Z_]+)_(\d+)__$/);
                if (placeholderMatch) {
                    const functionType = placeholderMatch[1]; // GREATEST, LEAST, GREATEST_IGNORE_NULLS, LEAST_IGNORE_NULLS
                    const index = parseInt(placeholderMatch[2]);

                    // Find the corresponding original function call
                    const originalFunction = statement.greatest_least_functions.find(
                        (f: any, i: number) => i === index && f.functionName === functionType
                    );

                    if (originalFunction) {
                        // Return the original function call with proper uppercase function name
                        const original = originalFunction.original;
                        const upperCaseFunctionName = functionType.toUpperCase();
                        // Replace the function name with uppercase version (including _ignore_nulls variants)
                        const formattedOriginal = original.replace(
                            /^(greatest(?:_ignore_nulls)?|least(?:_ignore_nulls)?)/i,
                            upperCaseFunctionName
                        );
                        return formattedOriginal;
                    }
                }
            }
        }
    }

    // Handle window functions with OVER clause
    if (func.over) {
        // Check for arguments
        let result;
        if (func.args && func.args.type === "expr_list" && Array.isArray(func.args.value)) {
            const args = func.args.value.map((arg: any) => processArg(arg, statement));
            result = `${funcName}(${args.join(", ")})`;
        } else if (func.args && func.args.expr) {
            if (func.args.expr.type === "star") {
                result = `${funcName}(*)`;
            } else if (func.args.expr.type === "column_ref") {
                result = `${funcName}(${formatColumnRef(func.args.expr)})`;
            } else {
                result = `${funcName}(${processArg(func.args.expr, statement)})`;
            }
        } else {
            result = `${funcName}()`;
        }

        // Format OVER clause
        result += " OVER (";

        // Handle PARTITION BY in OVER clause - must come before ORDER BY
        const windowSpec = func.over.as_window_specification?.window_specification;
        const partitionBy = windowSpec?.partitionby || func.over.partition_by;

        if (partitionBy) {
            result += "PARTITION BY ";

            if (Array.isArray(partitionBy)) {
                const partitionParts = partitionBy.map((item: any) => {
                    if (item.expr && item.expr.type === "column_ref") {
                        return formatColumnRef(item.expr);
                    } else if (item.type === "column_ref") {
                        return formatColumnRef(item);
                    } else if (item.column) {
                        // Handle simple column name
                        return item.column;
                    } else if (item.value) {
                        return item.value;
                    } else if (typeof item === "string") {
                        return item;
                    }
                    return "";
                });

                result += partitionParts.join(", ");
            } else if (typeof partitionBy === "string") {
                result += partitionBy;
            }
        }

        // Handle ORDER BY in OVER clause after PARTITION BY
        // Check for both the old and new AST formats
        const orderBy = windowSpec?.orderby || func.over.order_by;

        if (orderBy) {
            if (partitionBy) {
                result += " ";
            }

            result += "ORDER BY ";

            if (Array.isArray(orderBy)) {
                const orderParts = orderBy.map((item: any) => {
                    let orderStr = "";

                    if (item.expr && item.expr.type === "column_ref") {
                        orderStr = formatColumnRef(item.expr);
                    } else if (item.expr && item.expr.type === "function") {
                        orderStr = formatFunction(item.expr, statement);
                    } else if (item.expr && item.expr.type === "aggr_func") {
                        orderStr = formatAggregationFunction(item.expr);
                    } else if (item.expr && item.expr.value) {
                        orderStr = item.expr.value;
                    }

                    if (item.type) {
                        orderStr += ` ${item.type.toUpperCase()}`;
                    }

                    return orderStr;
                });

                result += orderParts.join(", ");
            }
        }

        result += ")";
        return result;
    }

    // Handle expr_list arguments structure
    if (func.args && func.args.type === "expr_list" && Array.isArray(func.args.value)) {
        const args = func.args.value.map((arg: any) => processArg(arg, statement));
        return `${funcName}(${args.join(", ")})`;
    }

    // Handle standard args.expr structure
    if (func.args && func.args.expr) {
        if (func.args.expr.type === "star") {
            return `${funcName}(*)`;
        } else if (func.args.expr.type === "column_ref") {
            return `${funcName}(${formatColumnRef(func.args.expr)})`;
        } else {
            return `${funcName}(${processArg(func.args.expr, statement)})`;
        }
    }

    return funcName + "()";
}

function processArg(arg: any, statement?: any): string {
    // If this is a function, check if it's one of our array access placeholders
    if (arg.type === "function" && statement?.array_accesses && statement.array_accesses.length > 0) {
        const funcName = typeof arg.name === "string" ? arg.name : arg.name?.name?.[0]?.value || "";

        if (funcName.includes("__ARRAYACCESS__")) {
            // Find the matching array access entry
            for (const access of statement.array_accesses) {
                if (
                    funcName.includes(access.placeholder.replace(/[()]/g, "")) ||
                    access.placeholder.includes(funcName.replace(/[()]/g, ""))
                ) {
                    // Format the arguments for the function call
                    let argsList = "";
                    if (arg.args && arg.args.type === "expr_list" && Array.isArray(arg.args.value)) {
                        argsList = arg.args.value.map((a: any) => processArg(a, statement)).join(", ");
                    }

                    // Extract the real function name from the placeholder
                    const realFuncName = access.original.split("(")[0];

                    // Reconstruct the function call with array access syntax
                    return `${realFuncName.toUpperCase()}(${argsList})[${access.index}]`;
                }
            }
        }
    }

    // Handle normal function processing
    if (arg.type === "function") {
        // Handle function with complex name structure
        if (arg.name && typeof arg.name === "object" && arg.name.name && Array.isArray(arg.name.name)) {
            // Extract function name from the complex structure and convert to uppercase
            const funcName = (arg.name.name[0]?.value || "").toUpperCase();

            // Handle function arguments
            if (arg.args && arg.args.type === "expr_list" && Array.isArray(arg.args.value)) {
                const processedArgs = arg.args.value.map((a: any) => processArg(a, statement));
                return `${funcName}(${processedArgs.join(", ")})`;
            }

            return `${funcName}()`;
        }

        return formatFunction(arg, statement);
    } else if (arg.type === "column_ref") {
        return formatColumnRef(arg);
    } else if (arg.type === "binary_expr") {
        return formatBinaryExpression(arg, statement);
    } else if (arg.type === "cast") {
        return formatCastExpression(arg, statement);
    } else if (arg.type === "number") {
        return arg.value.toString();
    } else if (arg.type === "single_quote_string") {
        // Handle boolean objects that ended up as string literals
        if (typeof arg.value === "object" && arg.value.type === "bool") {
            return arg.value.value ? "TRUE" : "FALSE";
        } else {
            return `'${arg.value}'`;
        }
    }
    return arg.distinct ? `DISTINCT ${arg.value || ""}` : arg.value || "";
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
        return `${funcName}(${func.args.distinct ? "DISTINCT " : ""}${arg})`;
    }

    return `${funcName}()`;
}

/**
 * Format a column reference
 */
function formatColumnRef(columnRef: any): string {
    if (!columnRef.column) return "";

    // Helper function to handle casting syntax (column::TYPE)
    const formatColumnWithCasting = (columnName: string): string => {
        if (columnName.includes("::")) {
            const [column, castType] = columnName.split("::");
            return `${column.toLowerCase()}::${castType.toUpperCase()}`;
        }
        return columnName.toLowerCase();
    };

    // Handle schema.table.column references (column names lowercase, cast types uppercase)
    if (columnRef.db && columnRef.table) {
        return `${columnRef.db}.${columnRef.table}.${formatColumnWithCasting(columnRef.column)}`;
    } else if (columnRef.table) {
        return `${columnRef.table}.${formatColumnWithCasting(columnRef.column)}`;
    }

    return formatColumnWithCasting(columnRef.column);
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

        // Check if this is a TABLE(GENERATOR()) call
        if (tableItem.__table_generator) {
            const params = tableItem.__table_generator.parameters;
            const paramParts: string[] = [];

            // Add parameters in consistent order: ROWCOUNT first, then TIMELIMIT
            if (params.ROWCOUNT) {
                paramParts.push(`ROWCOUNT => ${params.ROWCOUNT}`);
            }
            if (params.TIMELIMIT) {
                paramParts.push(`TIMELIMIT => ${params.TIMELIMIT}`);
            }

            fromText = `TABLE(GENERATOR(${paramParts.join(", ")}))`;

            if (tableItem.as) {
                fromText += ` ${tableItem.as}`;
            }
        } else if (tableItem.table) {
            // Include database name if provided
            if (tableItem.db) {
                fromText = `${tableItem.db.toLowerCase()}.${tableItem.table.toLowerCase()}`;
            } else {
                fromText = tableItem.table.toLowerCase();
            }

            if (tableItem.as) {
                fromText += ` ${tableItem.as}`;
            }
        }

        if (index > 0) {
            parts.push(", ");
        }

        // Check if the table name contains PIVOT/UNPIVOT syntax
        const pivotMatch = fromText.match(/^(.+?)\s+((?:UN)?PIVOT\(.+\))$/);
        if (pivotMatch) {
            // Split table name and PIVOT clause
            const tableName = pivotMatch[1];
            const pivotClause = pivotMatch[2];

            parts.push(tableName);
            parts.push(hardline);
            parts.push(pivotClause);
        } else {
            parts.push(fromText);
        }
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
    parts.push(joinType === "INNER JOIN" ? "JOIN" : joinType);
    parts.push(" ");

    // Use type assertion for the properties we know exist in our actual data
    const joinItem = joinDefinition as any;

    // Handle subquery in join
    if (joinItem.expr) {
        // This is a subquery
        parts.push("(");
        if (joinItem.expr.ast && joinItem.expr.ast.type === "select") {
            parts.push(indent([hardline, formatSelect(joinItem.expr.ast, false)]));
            parts.push(hardline);
        }
        parts.push(")");

        if (joinItem.as) {
            parts.push(" ");
            parts.push(joinItem.as);
        }
    } else if (joinItem.table) {
        // Include database/schema prefix if provided
        if (joinItem.db) {
            parts.push(`${joinItem.db}.${joinItem.table}`);
        } else {
            parts.push(joinItem.table);
        }

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
    // Format USING clause
    else if (joinItem.using) {
        parts.push(" USING(");

        if (Array.isArray(joinItem.using)) {
            // Join multiple columns with commas
            const columns = joinItem.using.map((item: any) => item.value || "").join(", ");
            parts.push(columns);
        } else if (typeof joinItem.using === "string") {
            parts.push(joinItem.using);
        } else if (joinItem.using.value) {
            // Single object case with value
            parts.push(joinItem.using.value);
        } else if (joinItem.using.column) {
            // Fallback to column if exists
            parts.push(joinItem.using.column);
        }

        parts.push(")");
    }

    return join("", parts);
}

/**
 * Format WHERE clause
 */
function formatWhere(where: any, statement?: any): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    if (!where) return join("", parts);

    if (where.type === "binary_expr") {
        const operator = where.operator.toUpperCase();

        if (["AND", "OR"].includes(operator)) {
            // Format complex conditions with AND/OR
            parts.push(" ");
            parts.push(formatBinaryExpressionWithIndent(where, statement));
        } else if (operator === "IN") {
            // Special handling for IN clause with subquery
            parts.push(" ");
            parts.push(formatExpressionValue(where.left, statement)); // Column or expression on left side
            parts.push(" IN ");

            // Check if the right side is an expr_list containing a subquery
            if (where.right && where.right.type === "expr_list" && where.right.value && where.right.value.length > 0) {
                const subquery = where.right.value[0];
                if (subquery && subquery.ast && subquery.ast.type === "select") {
                    parts.push("(");
                    parts.push(indent([hardline, formatSelect(subquery.ast, false)]));
                    parts.push(hardline);
                    parts.push(")");
                    return join("", parts);
                }
            }

            // Standard binary expression format if not a subquery
            parts.push(formatExpressionValue(where.right, statement));
        } else {
            // Simple binary expression
            parts.push(" ");
            parts.push(formatBinaryExpression(where, statement));
        }
    } else if (where.type === "function" && where.name?.name?.[0]?.value === "IN") {
        // Special handling for IN clause with subquery (alternative format)
        parts.push(" ");
        parts.push(formatExpressionValue(where.left, statement)); // Column or expression on left side
        parts.push(" IN ");

        // Format the subquery
        if (where.right && where.right.ast && where.right.ast.type === "select") {
            parts.push("(");
            parts.push(indent([hardline, formatSelect(where.right.ast, false)]));
            parts.push(hardline);
            parts.push(")");
        } else {
            parts.push(formatExpressionValue(where.right, statement));
        }
    } else if (where.type === "function" && where.name?.name?.[0]?.value === "exists") {
        // Special handling for EXISTS clause with subquery
        parts.push(" EXISTS ");

        // Check if args contains a subquery
        if (where.args && where.args.type === "expr_list" && where.args.value && where.args.value.length > 0) {
            const subquery = where.args.value[0];
            if (subquery && subquery.ast && subquery.ast.type === "select") {
                parts.push("(");
                parts.push(indent([hardline, formatSelect(subquery.ast, false)]));
                parts.push(hardline);
                parts.push(")");
                return join("", parts);
            }
        }

        // If no subquery found in args, check direct args property
        if (where.args && where.args.ast && where.args.ast.type === "select") {
            parts.push("(");
            parts.push(indent([hardline, formatSelect(where.args.ast, false)]));
            parts.push(hardline);
            parts.push(")");
        }
    } else if (where.type === "unary_expr") {
        // Handle unary expressions like NOT, +, -, etc.
        parts.push(" ");
        const operator = where.operator?.toUpperCase() || "";
        const expr = formatExpressionValue(where.expr, statement);
        parts.push(`${operator} ${expr}`);
    } else if (where.type === "column_ref") {
        parts.push(" ");
        parts.push(formatColumnRef(where));
    } else {
        parts.push(" ");
        parts.push(where.value || "");
    }

    return join("", parts);
}

/**
 * Format a binary expression
 */
function formatBinaryExpression(expr: any, statement?: any): string {
    if (!expr || expr.type !== "binary_expr") {
        return expr?.value || "";
    }

    const left =
        expr.left.type === "binary_expr"
            ? formatBinaryExpression(expr.left, statement)
            : formatExpressionValue(expr.left, statement);

    const right =
        expr.right.type === "binary_expr"
            ? formatBinaryExpression(expr.right, statement)
            : formatExpressionValue(expr.right, statement);

    const operator = expr.operator;

    // Special handling for BETWEEN operator
    if (operator === "BETWEEN" && expr.right && expr.right.type === "expr_list" && Array.isArray(expr.right.value)) {
        const rangeValues = expr.right.value.map((val: any) => formatExpressionValue(val, statement));
        return `${left} BETWEEN ${rangeValues[0]} AND ${rangeValues[1]}`;
    }

    // Special handling for IS NULL and IS NOT NULL conditions
    if (operator === "IS NOT" && (right === "NULL" || (expr.right && expr.right.type === "null"))) {
        return `${left} IS NOT NULL`;
    }
    if (operator === "IS" && (right === "NULL" || (expr.right && expr.right.type === "null"))) {
        return `${left} IS NULL`;
    }

    return `${left} ${operator} ${right}`;
}

/**
 * Format binary expressions with indentation for AND/OR operators
 */
function formatBinaryExpressionWithIndent(expr: any, statement?: any): doc.builders.DocCommand {
    if (!expr || expr.type !== "binary_expr") {
        return expr?.value || "";
    }

    const parts: doc.builders.DocCommand[] = [];
    const operator = expr.operator.toUpperCase();

    if (["AND", "OR"].includes(operator)) {
        // Left side of the expression
        if (expr.left.type === "binary_expr" && ["AND", "OR"].includes(expr.left.operator.toUpperCase())) {
            parts.push(formatBinaryExpressionWithIndent(expr.left, statement));
        } else if (expr.left.type === "binary_expr") {
            parts.push(formatBinaryExpression(expr.left, statement));
        } else {
            // Handle non-binary expressions (like unary_expr, column_ref, etc.)
            parts.push(formatExpressionValue(expr.left, statement));
        }

        // AND/OR operator and right side with indent
        parts.push(hardline);
        parts.push("  ");
        parts.push(operator);
        parts.push(" ");

        // Handle parentheses for the right side
        if (expr.right && expr.right.parentheses) {
            parts.push("(");
            // Just use formatBinaryExpression to handle the parenthesized content
            parts.push(formatBinaryExpression(expr.right, statement));
            parts.push(")");
        } else {
            if (expr.right.type === "binary_expr" && ["AND", "OR"].includes(expr.right.operator.toUpperCase())) {
                parts.push(formatBinaryExpression(expr.right.left, statement));
                parts.push(hardline);
                parts.push("  ");
                parts.push(expr.right.operator.toUpperCase());
                parts.push(" ");
                parts.push(formatExpressionValue(expr.right.right, statement));
            } else {
                parts.push(formatBinaryExpression(expr.right, statement));
            }
        }
    } else {
        // Simple binary expression
        parts.push(formatBinaryExpression(expr, statement));
    }

    return join("", parts);
}

/**
 * Format an expression value
 */
function formatExpressionValue(expr: any, statement?: any): string {
    if (!expr) return "";

    if (expr.type === "column_ref") {
        return formatColumnRef(expr);
    } else if (expr.type === "number") {
        // Handle boolean objects that ended up as number types
        if (typeof expr.value === "object" && expr.value.type === "bool") {
            return expr.value.value ? "TRUE" : "FALSE";
        }
        return expr.value.toString();
    } else if (expr.type === "function") {
        // Special case for common SQL functions that don't use parentheses
        if (expr.name?.name?.[0]?.value) {
            const funcName = expr.name.name[0].value.toUpperCase();
            if (["CURRENT_DATE", "CURRENT_TIMESTAMP"].includes(funcName)) {
                return funcName;
            } else if (funcName.includes("__ARRAYACCESS__")) {
                // Handle array access functions
                const arrayAccessMatch = funcName.match(/__ARRAYACCESS__(\d+)__(.+)/);
                if (arrayAccessMatch) {
                    const index = arrayAccessMatch[1];
                    const originalFuncName = arrayAccessMatch[2].toUpperCase();
                    return `${originalFuncName}(${expr.args?.value.map((arg: any) => processArg(arg, statement)).join(", ")})[${index}]`;
                }
            }
        }
        return processArg(expr, statement); // Use processArg to handle all function cases
    } else if (expr.type === "single_quote_string") {
        // Handle boolean objects that ended up as string literals
        if (typeof expr.value === "object" && expr.value.type === "bool") {
            return expr.value.value ? "TRUE" : "FALSE";
        } else {
            return `'${expr.value}'`;
        }
    } else if (expr.type === "bool") {
        return expr.value ? "TRUE" : "FALSE";
    } else if (expr.type === "unary_expr") {
        // Handle unary expressions like NOT, +, -, etc.
        const operator = expr.operator?.toUpperCase() || "";
        const operand = formatExpressionValue(expr.expr, statement);
        return `${operator} ${operand}`;
    } else if (expr.type === "null") {
        return "NULL";
    } else if (expr.type === "binary_expr") {
        // Handle binary expressions and respect parentheses
        const result = formatBinaryExpression(expr, statement);
        return expr.parentheses ? `(${result})` : result;
    } else if (expr.type === "case") {
        // Handle CASE expressions
        return formatCaseExpression(expr, statement);
    } else if (expr.type === "cast") {
        // Handle CAST expressions
        return formatCastExpression(expr, statement);
    } else if (expr.type === "aggr_func") {
        // Handle aggregate functions
        return formatAggregationFunction(expr);
    } else if (expr.type === "expr_list") {
        // Handle expression lists (e.g., IN clause values)
        if (Array.isArray(expr.value)) {
            return `(${expr.value.map((item: any) => formatExpressionValue(item, statement)).join(", ")})`;
        }
        return "";
    }

    // Handle boolean objects that weren't caught by specific type checks
    if (typeof expr === "object" && expr.type === "bool") {
        return expr.value ? "TRUE" : "FALSE";
    }

    // Handle boolean objects in the value property
    if (expr.value && typeof expr.value === "object" && expr.value.type === "bool") {
        return expr.value.value ? "TRUE" : "FALSE";
    }

    return expr.value || "";
}

/**
 * Format a CASE expression
 */
function formatCaseExpression(expr: any, statement?: any): string {
    const whenClauses: string[] = [];
    let elseClause: string | null = null;

    // Collect WHEN and ELSE clauses from args array
    if (expr.args && Array.isArray(expr.args)) {
        for (const arg of expr.args) {
            if (arg.type === "when") {
                const condition = formatExpressionValue(arg.cond, statement);
                const result = formatExpressionValue(arg.result, statement);
                whenClauses.push(`WHEN ${condition} THEN ${result}`);
            } else if (arg.type === "else") {
                const elseResult = formatExpressionValue(arg.result, statement);
                elseClause = `ELSE ${elseResult}`;
            }
        }
    }

    // Determine if this should be single-line or multi-line
    const isSingleWhen = whenClauses.length === 1 && elseClause;

    if (isSingleWhen) {
        // Single WHEN with ELSE: format on one line
        const parts: string[] = ["CASE"];

        // Handle CASE expr WHEN ... (simple case)
        if (expr.expr) {
            parts.push(formatExpressionValue(expr.expr, statement));
        }

        parts.push(...whenClauses);
        if (elseClause) {
            parts.push(elseClause);
        }
        parts.push("END");

        const result = parts.join(" ");
        return expr.parentheses ? `(${result})` : result;
    } else {
        // Multiple WHENs: format with line breaks and indentation
        const parts: string[] = [];

        // Start with CASE and first WHEN on same line
        let caseStart = "CASE";

        // Handle CASE expr WHEN ... (simple case)
        if (expr.expr) {
            caseStart += ` ${formatExpressionValue(expr.expr, statement)}`;
        }

        if (whenClauses.length > 0) {
            parts.push(`${caseStart} ${whenClauses[0]}`);

            // Add remaining WHEN clauses with proper indentation
            // Need to align with the first WHEN. The first line is "CASE WHEN", so subsequent lines
            // should have enough spaces to align the WHEN keywords
            const indent = "            "; // 12 spaces to align with first WHEN
            for (let i = 1; i < whenClauses.length; i++) {
                parts.push(`${indent}${whenClauses[i]}`);
            }
        } else {
            parts.push(caseStart);
        }

        // Add ELSE clause with same indentation as WHEN clauses
        if (elseClause) {
            parts.push(`            ${elseClause}`);
        }

        // Add END with same indentation
        parts.push("            END");

        const result = parts.join("\n");
        return expr.parentheses ? `(${result})` : result;
    }
}

/**
 * Format a CAST expression
 */
function formatCastExpression(expr: any, statement?: any): string {
    const expression = formatExpressionValue(expr.expr, statement);

    // Handle target data type - it's usually an array with the first element containing dataType
    let dataType = "";
    if (Array.isArray(expr.target) && expr.target.length > 0) {
        dataType = expr.target[0].dataType || "";
    } else if (expr.target?.dataType) {
        dataType = expr.target.dataType;
    } else {
        dataType = expr.target || "";
    }

    // Check if this was originally a PostgreSQL-style cast (::)
    // If so, format it back to :: syntax
    if (expr.postgresql_cast) {
        return `${expression}::${dataType.toString().toUpperCase()}`;
    }

    // Default to CAST() syntax for regular CAST expressions
    return `CAST(${expression} AS ${dataType.toString().toUpperCase()})`;
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
/**
 * Determine if a blank line should be added between two statements
 */
function shouldAddBlankLine(prevStmt: any, currStmt: any): boolean {
    // Don't add blank lines after comments
    if (prevStmt.type === "comment") {
        return false;
    }

    // Always add blank line between CREATE statements
    if (prevStmt.type === "create" && currStmt.type === "create") {
        return true;
    }

    // No blank line between consecutive GRANT statements
    if (prevStmt.type === "grant" && currStmt.type === "grant") {
        return false;
    }

    // Add blank line between SELECT statements for better readability
    if (prevStmt.type === "select" && currStmt.type === "select") {
        return true;
    }

    // By default, add a blank line between different statement types
    return prevStmt.type !== currStmt.type;
}

/**
 * Format CTE content within a USING clause
 */
function formatCTEInUsing(innerSql: string): doc.builders.DocCommand {
    // Basic formatting for CTE in USING clause
    const parts: doc.builders.DocCommand[] = [];

    // Look for WITH clause pattern
    const withMatch = innerSql.match(/^(with\s+\w+\s+as\s*\([^)]+\))\s+(.+)$/i);
    if (withMatch) {
        const [, withClause, selectClause] = withMatch;

        // Format the WITH clause with proper indentation (4 spaces)
        parts.push("    WITH ");
        const cteMatch = withClause.match(/with\s+(\w+)\s+as\s*\(([^)]+)\)/i);
        if (cteMatch) {
            const [, cteName, cteQuery] = cteMatch;
            parts.push(cteName);
            parts.push(" AS (");
            parts.push(hardline);

            // Format the inner query with proper case and structure
            const innerQuery = cteQuery.trim();
            // Parse the inner query to format it properly
            const selectMatch = innerQuery.match(/^select\s+(.+?)\s+from\s+(.+)$/i);
            if (selectMatch) {
                const [, selectList, fromClause] = selectMatch;
                parts.push("        SELECT " + selectList.trim());
                parts.push(hardline);
                parts.push("        FROM " + fromClause.trim());
            } else {
                parts.push("        " + innerQuery.toUpperCase());
            }

            parts.push(hardline);
            parts.push("    )");
        }

        parts.push(hardline);
        // Format the outer SELECT with proper indentation (4 spaces)
        const outerSelectMatch = selectClause.trim().match(/^select\s+(.+?)\s+from\s+(.+)$/i);
        if (outerSelectMatch) {
            const [, selectList, fromClause] = outerSelectMatch;
            parts.push("    SELECT " + selectList.trim());
            parts.push(hardline);
            parts.push("    FROM " + fromClause.trim());
        } else {
            parts.push("    " + selectClause.trim().toUpperCase());
        }
    } else {
        // Fallback for other patterns
        parts.push(innerSql.trim().replace(/\s+/g, " ").toUpperCase());
    }

    return join("", parts);
}

/**
 * Format a DELETE statement
 */
function formatDelete(ast: Delete, includeSemicolon: boolean = true): doc.builders.DocCommand {
    const parts: doc.builders.DocCommand[] = [];

    // DELETE keyword
    parts.push("DELETE FROM");

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

    // USING clause
    if ((ast as any).using) {
        parts.push(hardline);
        parts.push("USING ");
        const usingClause = (ast as any).using;

        // Check if the USING clause has an alias at the end
        const aliasMatch = usingClause.match(/^(.+?)\s+AS\s+(\w+)$/i);
        let mainClause = usingClause;
        let alias = null;

        if (aliasMatch) {
            mainClause = aliasMatch[1].trim();
            alias = aliasMatch[2];
        }

        // Check if the main clause is a subquery (starts with parentheses)
        if (mainClause.startsWith("(") && mainClause.endsWith(")")) {
            const innerSql = mainClause.slice(1, -1).trim();

            // Check if it contains WITH (CTE) - format it specially
            if (innerSql.toLowerCase().includes("with ")) {
                parts.push("(");
                parts.push(hardline);
                parts.push(formatCTEInUsing(innerSql));
                parts.push(hardline);
                parts.push(")");
            } else {
                parts.push("(");
                parts.push(hardline);
                parts.push(indent([innerSql]));
                parts.push(hardline);
                parts.push(")");
            }
        } else {
            parts.push(mainClause);
        }

        // Add alias if present
        if (alias) {
            parts.push(" AS ");
            parts.push(alias);
        }
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
        // Parse the statement to uppercase keywords while preserving identifier case
        const statement = ast.statement.replace(
            /\b(GRANT|ON|IN|TO|ROLE|USAGE|SELECT|CREATE|TABLE|TABLES|VIEWS|FUTURE|DELETE|INSERT|REBUILD|REFERENCES|TRUNCATE|UPDATE|MONITOR)\b/gi,
            (match) => match.toUpperCase()
        );
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
