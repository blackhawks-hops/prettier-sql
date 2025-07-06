import { Node, NodeType, SQLNode } from "./types";

const FUNCTIONS = ["ABS", "AVG", "COUNT", "MAX", "MIN", "SUM", "LENGTH", "TRIM", "UPPER", "LOWER", "NOW", "COALESCE"];
export const KEYWORDS = [
    "SELECT",
    "FROM",
    "WHERE",
    "JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "INNER JOIN",
    "OUTER JOIN",
    "ON",
    "AND",
    "OR",
    "AS",
    "WITH",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "UNION",
    "INTERSECT",
    "EXCEPT",
];

export class SQLParser {
    /**
     * Parse SQL code into an AST
     */
    static parse(text: string): SQLNode {
        // Split the SQL into tokens and build a simple AST
        const lines = text.split("\n");
        const tokens = this.tokenize(text);

        // Pre-process tokens to handle column aliases correctly
        const processedTokens = this.preprocessTokens(tokens);

        const ast = this.buildAST(processedTokens);

        // Add position information
        return {
            type: "sql",
            value: text,
            tokens: processedTokens,
            body: ast,
            loc: {
                start: { line: 1, column: 0 },
                end: { line: lines.length, column: lines[lines.length - 1].length },
            },
        };
    }

    /**
     * Preprocess tokens to handle special cases like column aliases with AS
     */
    static preprocessTokens(tokens: string[]): string[] {
        const result: string[] = [];
        let i = 0;

        while (i < tokens.length) {
            // Check for AS followed by a name (column alias pattern)
            if (i + 2 < tokens.length && tokens[i + 1].toUpperCase() === "AS" && !this.isClauseKeyword(tokens[i + 2])) {
                // Combine the expression before AS, the AS keyword, and the alias into a single token
                const combinedToken = `${tokens[i]} AS ${tokens[i + 2]}`;
                result.push(combinedToken);
                i += 3; // Skip the next two tokens as we've combined them
            } else {
                result.push(tokens[i]);
                i += 1;
            }
        }

        return result;
    }

    /**
     * Tokenize SQL code into tokens
     */
    static tokenize(text: string): string[] {
        // Clean and normalize the SQL text by replacing multiple whitespace with a single space
        const cleanText = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

        // Prepare tokens array
        const tokens: string[] = [];

        // Create a regex pattern for SQL keywords that ensures they are matched as whole words
        const keywordPattern = KEYWORDS.map((k) => `\\b${k.replace(/\s+/g, "\\s+")}\\b`).join("|");
        const keywordRegex = new RegExp(keywordPattern, "gi");

        // Replace string literals temporarily to avoid parsing their contents
        const stringPlaceholder = "__STRING_LITERAL__";
        const stringLiterals: string[] = [];

        // Extract string literals and replace with placeholders
        const withPlaceholders = cleanText.replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, (match) => {
            stringLiterals.push(match);
            return stringPlaceholder;
        });

        // Track string placeholders
        let stringIndex = 0;

        // Prepare for tokenizing
        let lastIndex = 0;
        let match;

        // Match SQL keywords
        while ((match = keywordRegex.exec(withPlaceholders)) !== null) {
            const keyword = match[0].toUpperCase();
            const beforeText = withPlaceholders.substring(lastIndex, match.index).trim();

            // Process text before the current keyword
            if (beforeText) {
                // Handle commas and content between keywords
                const segments = beforeText
                    .split(",")
                    .map((segment) => segment.trim())
                    .filter(Boolean);

                for (let i = 0; i < segments.length; i++) {
                    let segment = segments[i];

                    // Replace string placeholders with actual strings
                    while (segment.includes(stringPlaceholder)) {
                        segment = segment.replace(stringPlaceholder, stringLiterals[stringIndex++]);
                    }

                    tokens.push(segment);
                    if (i < segments.length - 1) {
                        tokens.push(",");
                    }
                }
            }

            // Add the keyword
            tokens.push(match[0]);
            lastIndex = match.index + match[0].length;
        }

        // Process remaining text after the last keyword
        if (lastIndex < withPlaceholders.length) {
            const remainingText = withPlaceholders.substring(lastIndex).trim();

            if (remainingText) {
                const segments = remainingText
                    .split(",")
                    .map((segment) => segment.trim())
                    .filter(Boolean);

                for (let i = 0; i < segments.length; i++) {
                    let segment = segments[i];

                    // Replace string placeholders with actual strings
                    while (segment.includes(stringPlaceholder)) {
                        segment = segment.replace(stringPlaceholder, stringLiterals[stringIndex++]);
                    }

                    tokens.push(segment);
                    if (i < segments.length - 1) {
                        tokens.push(",");
                    }
                }
            }
        }

        // Handle special cases: parentheses for subqueries and CTEs
        const processedTokens: string[] = [];
        for (const token of tokens) {
            if (this.includesFunction(token)) {
                // uppercase function names
                processedTokens.push(token.toUpperCase());
            } else if (token.includes("(") || token.includes(")")) {
                // Split token by parentheses but keep the parentheses
                const parts = token
                    .split(/([()])/g)
                    .filter(Boolean)
                    .map((part) => part.trim())
                    .filter(Boolean);
                processedTokens.push(...parts);
            } else {
                processedTokens.push(token);
            }
        }

        return processedTokens;
    }

    /**
     * Build a simple AST from tokens
     */
    static buildAST(tokens: string[]): Node[] {
        const ast: Node[] = [];

        let i = 0;
        let inCTE = false; // Track if we're inside a WITH clause (CTE)
        let cteNodes: Node[] = [];

        // Process tokens
        while (i < tokens.length) {
            const token = tokens[i].toUpperCase();

            // Handle WITH statements (CTEs)
            if (token === "WITH") {
                inCTE = true;
                i++;
                continue; // Move to the next token which should be the CTE name
            }

            if (inCTE) {
                // Get CTE name
                const cteName = tokens[i];
                i++;

                // Skip AS keyword
                if (i < tokens.length && tokens[i].toUpperCase() === "AS") {
                    i++;
                } else {
                    // Something went wrong, AS keyword missing
                    continue;
                }

                // Parse CTE subquery (inside parentheses)
                if (i < tokens.length && tokens[i] === "(") {
                    i++; // Skip opening parenthesis

                    const cteNode: Node = {
                        type: NodeType.CTE,
                        name: cteName,
                        body: [],
                    };

                    // Collect everything in the CTE subquery until matching closing parenthesis
                    let depth = 1;
                    const subqueryTokens: string[] = [];

                    while (i < tokens.length && depth > 0) {
                        if (tokens[i] === "(") depth++;
                        else if (tokens[i] === ")") depth--;

                        if (depth > 0) {
                            subqueryTokens.push(tokens[i]);
                        }
                        i++;
                    }

                    // Parse the CTE subquery tokens to build its own AST
                    // For most CTEs this will be a SELECT statement
                    const subqueryAST = this.parseSubquery(subqueryTokens);
                    cteNode.body = subqueryAST;
                    cteNodes.push(cteNode);

                    // Check for comma after CTE which indicates another CTE follows
                    if (i < tokens.length && tokens[i] === ",") {
                        i++; // Skip the comma
                    } else {
                        // No more CTEs, end of WITH clause
                        inCTE = false;
                        ast.push(...cteNodes); // Add all CTEs to the AST
                    }
                    continue;
                }
            }

            // Handle SELECT statements
            if (token === "SELECT") {
                // Initialize a new SELECT node
                const selectNode: Required<Pick<Node, "type" | "columns" | "from" | "joins" | "where">> = {
                    type: NodeType.Select,
                    columns: [],
                    from: "",
                    joins: [],
                    where: [],
                };
                i++;

                // Parse SELECT columns until FROM
                selectNode.columns = [];

                // Collect all column tokens until FROM
                const columnTokens: string[] = [];
                while (i < tokens.length && tokens[i].toUpperCase() !== "FROM") {
                    if (tokens[i] !== ",") {
                        columnTokens.push(tokens[i]);
                    }
                    i++;
                }

                // Process column tokens to identify functions and aliases
                for (let j = 0; j < columnTokens.length; j++) {
                    // Get the current token and check if it contains an alias
                    const columnText = columnTokens[j];
                    const column = this.parseColumn(columnText);
                    selectNode.columns.push(column);
                }

                // Parse FROM clause
                if (i < tokens.length && tokens[i].toUpperCase() === "FROM") {
                    i++;
                    if (i < tokens.length && !this.isClauseKeyword(tokens[i])) {
                        selectNode.from = tokens[i];
                        i++;
                    }
                }

                // Parse JOIN clauses
                while (i < tokens.length && this.isJoinKeyword(tokens[i])) {
                    const joinType = tokens[i].toUpperCase();
                    i++;

                    const joinNode: Required<Pick<Node, "type" | "joinType" | "table" | "condition">> = {
                        type: NodeType.Join,
                        joinType,
                        table: "",
                        condition: [],
                    };

                    // Parse join table
                    if (i < tokens.length && !this.isClauseKeyword(tokens[i]) && tokens[i].toUpperCase() !== "ON") {
                        joinNode.table = tokens[i];
                        i++;
                    }

                    // Parse ON clause
                    if (i < tokens.length && tokens[i].toUpperCase() === "ON") {
                        i++;

                        // Collect join condition until next clause
                        while (i < tokens.length && !this.isClauseKeyword(tokens[i])) {
                            joinNode.condition.push(tokens[i]);
                            i++;
                        }
                    }

                    selectNode.joins.push(joinNode);
                }

                // Parse WHERE clause
                if (i < tokens.length && tokens[i].toUpperCase() === "WHERE") {
                    i++;

                    // Collect all conditions including AND/OR
                    const whereConditions: string[] = [];

                    while (
                        i < tokens.length &&
                        !["GROUP", "ORDER", "LIMIT", "HAVING", "UNION", "INTERSECT", "EXCEPT"].includes(
                            tokens[i].toUpperCase()
                        )
                    ) {
                        whereConditions.push(tokens[i]);
                        i++;
                    }

                    selectNode.where = whereConditions;
                }

                ast.push(selectNode);
                continue;
            }

            // Add other token types as plain tokens
            ast.push({ type: NodeType.Token, value: tokens[i] });
            i++;
        }

        return ast;
    }

    /**
     * Parse a subquery (used for CTEs and nested queries)
     */
    static parseSubquery(tokens: string[]): Node[] {
        // Reuse the buildAST method for subqueries
        return this.buildAST(tokens);
    }

    /**
     * Check if a token is a SQL clause keyword
     */
    static isClauseKeyword(token: string): boolean {
        const clauseKeywords = [
            "SELECT",
            "FROM",
            "WHERE",
            "GROUP",
            "ORDER",
            "HAVING",
            "LIMIT",
            "JOIN",
            "LEFT",
            "RIGHT",
            "INNER",
            "OUTER",
            "UNION",
            "INTERSECT",
            "EXCEPT",
        ];

        return clauseKeywords.includes(token.toUpperCase());
    }

    /**
     * Check if a token is a JOIN keyword
     */
    static isJoinKeyword(token: string): boolean {
        const joinKeywords = ["JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "OUTER JOIN"];
        return joinKeywords.some((keyword) => token.toUpperCase().includes(keyword));
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

    /**
     * Create a function to parse SQL in template literals
     */
    static parseEmbedded(originalParse: (text: string, parsers: unknown, options: unknown) => unknown) {
        return (text: string, parsers: unknown, options: unknown) => {
            // First parse with the original parser
            const ast = originalParse(text, parsers, options);

            // Then find and process SQL template literals
            this.processNodes(ast, (node) => {
                // Check for tagged template expressions with tag name 'sql'
                const nodeType = node.type as string;

                if (
                    nodeType === "TaggedTemplateExpression" &&
                    this.hasTagProperty(node) &&
                    this.hasQuasiProperty(node)
                ) {
                    const tag = node.tag as { type: string; name: string };
                    if (tag.type === "Identifier" && tag.name === "sql") {
                        // Extract the SQL from the template literal
                        const quasi = node.quasi as { quasis: Array<{ value: { raw: string } }> };
                        const sqlText = quasi.quasis.map((q) => q.value.raw).join("");

                        // Parse the SQL text
                        const sqlAst = this.parse(sqlText);

                        // Add a newline to the beginning to ensure proper formatting for template literals
                        if (sqlAst && typeof sqlAst === "object") {
                            sqlAst.value = "\n" + sqlText.trim();
                            // Add flag to indicate this is a template literal for special handling in printer
                            (sqlAst as any).isTemplateLiteral = true;
                        }

                        // Attach the SQL AST to the node for later processing
                        (node as any).sqlAst = sqlAst;
                    }
                }
                return node;
            });

            return ast;
        };
    }

    /**
     * Type guard for nodes with tag property
     */
    static hasTagProperty(node: Record<string, unknown>): boolean {
        return "tag" in node && node.tag !== null && typeof node.tag === "object";
    }

    /**
     * Type guard for nodes with quasi property
     */
    static hasQuasiProperty(node: Record<string, unknown>): boolean {
        return "quasi" in node && node.quasi !== null && typeof node.quasi === "object";
    }
    /**
     * Process each node in the AST
     */
    static processNodes(ast: unknown, processFn: (node: Record<string, unknown>) => Record<string, unknown>): void {
        if (!ast || typeof ast !== "object") {
            return;
        }

        // Type guard to ensure ast is an object with string keys
        const astObject = ast as Record<string, unknown>;

        // Process this node
        if (this.isValidNode(astObject)) {
            processFn(astObject);
        }

        // Process children
        for (const key in astObject) {
            if (Object.prototype.hasOwnProperty.call(astObject, key) && key !== "loc" && key !== "range") {
                const value = astObject[key];
                if (Array.isArray(value)) {
                    value.forEach((item) => {
                        if (item && typeof item === "object") {
                            this.processNodes(item, processFn);
                        }
                    });
                } else if (value && typeof value === "object") {
                    this.processNodes(value, processFn);
                }
            }
        }
    }

    /**
     * Check if an object can be processed as a node
     */
    static isValidNode(obj: unknown): obj is Record<string, unknown> {
        return obj !== null && typeof obj === "object";
    }

    static includesFunction(token: string): boolean {
        // Check if the token is a function name
        return FUNCTIONS.some((func) => token.toUpperCase().startsWith(func.toUpperCase()));
    }

    /**
     * Parse a column expression which may include an alias or function
     */
    static parseColumn(columnText: string): import("./types").Column {
        const aliasRegex = /^(\S+)\s+AS\s+(\S+)$/i;
        const aliasMatch = aliasRegex.exec(columnText);
        if (aliasMatch) {
            const [, name, alias] = aliasMatch;
            return { name, alias };
        } else {
            return { name: columnText };
        }
    }
}
