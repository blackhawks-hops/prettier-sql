import { Node, NodeType, SQLNode } from './types';

export class SQLParser {
  /**
   * Parse SQL code into an AST
   */
  static parse(text: string): SQLNode {
    // Split the SQL into tokens and build a simple AST
    const lines = text.split('\n');
    const tokens = this.tokenize(text);
    const ast = this.buildAST(tokens);
    
    // Add position information
    return {
      type: 'sql',
      value: text,
      tokens: tokens,
      body: ast,
      loc: {
        start: { line: 1, column: 0 },
        end: { line: lines.length, column: lines[lines.length - 1].length }
      }
    };
  }

  /**
   * Tokenize SQL code into tokens
   */
  static tokenize(text: string): string[] {
    // Simple tokenization - split on spaces and preserve special characters
    // In a real implementation, this would be more sophisticated
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Split by common SQL keywords and punctuation while preserving them
    const regex = /(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AND|OR|AS|WITH|UNION|ALL|LIMIT|OFFSET|,|;|\(|\))/gi;
    
    let tokens: string[] = [];
    let lastIndex = 0;
    
    // Extract tokens using regex matches
    let match;
    while ((match = regex.exec(cleanText)) !== null) {
      const precedingText = cleanText.substring(lastIndex, match.index).trim();
      if (precedingText) {
        tokens.push(precedingText);
      }
      tokens.push(match[0]);
      lastIndex = match.index + match[0].length;
    }
    
    // Add any remaining text
    const remainingText = cleanText.substring(lastIndex).trim();
    if (remainingText) {
      tokens.push(remainingText);
    }
    
    return tokens;
  }

  /**
   * Build a simple AST from tokens
   */
  static buildAST(tokens: string[]): Node[] {
    const ast: Node[] = [];
    
    // In a real implementation, this would parse the tokens into a proper SQL AST
    // For this example, we'll create a simplified structure
    
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i].toUpperCase();
      
      if (token === 'WITH') {
        // Parse CTEs
        const cteNode: Node = { type: NodeType.CTE, name: '', columns: [], body: [] };
        i++;
        
        // Parse CTE name
        if (i < tokens.length) {
          cteNode.name = tokens[i];
          i++;
        }
        
        // Skip AS and parse body
        if (i < tokens.length && tokens[i].toUpperCase() === 'AS') {
          i++;
          if (i < tokens.length && tokens[i] === '(') {
            i++;
            const subquery: Node[] = [];
            let depth = 1;
            
            while (i < tokens.length && depth > 0) {
              if (tokens[i] === '(') depth++;
              if (tokens[i] === ')') depth--;
              
              if (depth > 0) {
                subquery.push({ type: NodeType.Token, value: tokens[i] });
              }
              i++;
            }
            
            cteNode.body = subquery;
          }
        }
        
        ast.push(cteNode);
        continue;
      }
      
      if (token === 'SELECT') {
        // Parse SELECT statement
        const selectNode: Node = { type: NodeType.Select, columns: [], from: '', joins: [], where: [] };
        i++;
        
        // Parse columns until FROM
        while (i < tokens.length && tokens[i].toUpperCase() !== 'FROM') {
          if (tokens[i] !== ',') {
            selectNode.columns.push(tokens[i]);
          }
          i++;
        }
        
        // Parse FROM clause
        if (i < tokens.length && tokens[i].toUpperCase() === 'FROM') {
          i++;
          if (i < tokens.length) {
            selectNode.from = tokens[i];
            i++;
          }
        }
        
        // Parse JOIN clauses
        while (i < tokens.length && tokens[i].toUpperCase().includes('JOIN')) {
          const joinType = tokens[i].toUpperCase();
          i++;
          
          const joinNode: Node = { type: NodeType.Join, joinType, table: '', condition: [] };
          
          // Parse join table
          if (i < tokens.length) {
            joinNode.table = tokens[i];
            i++;
          }
          
          // Parse ON clause
          if (i < tokens.length && tokens[i].toUpperCase() === 'ON') {
            i++;
            
            // Collect join condition until next clause
            while (i < tokens.length && 
                  !['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER'].includes(tokens[i].toUpperCase())) {
              joinNode.condition.push(tokens[i]);
              i++;
            }
          }
          
          selectNode.joins.push(joinNode);
        }
        
        // Parse WHERE clause
        if (i < tokens.length && tokens[i].toUpperCase() === 'WHERE') {
          i++;
          
          // Collect where conditions
          while (i < tokens.length && 
                !['GROUP', 'ORDER', 'LIMIT', 'HAVING'].includes(tokens[i].toUpperCase())) {
            selectNode.where.push(tokens[i]);
            i++;
          }
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
   * Get the start location of a node
   */
  static locStart(node: any): number {
    return node.loc?.start ?? 0;
  }

  /**
   * Get the end location of a node
   */
  static locEnd(node: any): number {
    return node.loc?.end ?? 0;
  }

  /**
   * Create a function to parse SQL in template literals
   */
  static parseEmbedded(originalParse: (text: string, parsers: any, options: any) => any) {
    return (text: string, parsers: any, options: any) => {
      // First parse with the original parser
      const ast = originalParse(text, parsers, options);

      // Then find and process SQL template literals
      this.processNodes(ast, (node) => {
        // Check for tagged template expressions with tag name 'sql'
        if (
          node.type === 'TaggedTemplateExpression' &&
          node.tag.type === 'Identifier' &&
          node.tag.name === 'sql'
        ) {
          // Extract the SQL from the template literal
          const sqlText = node.quasi.quasis
            .map((quasi: any) => quasi.value.raw)
            .join('');

          // Parse the SQL text
          const sqlAst = this.parse(sqlText);
          
          // Attach the SQL AST to the node for later processing
          node.sqlAst = sqlAst;
        }
        return node;
      });

      return ast;
    };
  }

  /**
   * Process each node in the AST
   */
  static processNodes(ast: any, processFn: (node: any) => any): void {
    if (!ast || typeof ast !== 'object') {
      return;
    }

    // Process this node
    processFn(ast);

    // Process children
    for (const key in ast) {
      if (ast.hasOwnProperty(key) && key !== 'loc' && key !== 'range') {
        const value = ast[key];
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object') {
              this.processNodes(item, processFn);
            }
          });
        } else if (value && typeof value === 'object') {
          this.processNodes(value, processFn);
        }
      }
    }
  }
}