import { parsers as javascriptParsers } from 'prettier/parser-babel';
import { parsers as typescriptParsers } from 'prettier/parser-typescript';
import { SQLParser } from './parser';
import { print } from './printer';

export const parsers = {
  // Parser for standalone SQL files
  sql: {
    parse: SQLParser.parse,
    astFormat: 'sql-ast',
    locStart: SQLParser.locStart,
    locEnd: SQLParser.locEnd,
  },
  // Enhanced JavaScript parser to handle SQL template literals
  'babel-sql': {
    ...javascriptParsers.babel,
    parse: SQLParser.parseEmbedded(javascriptParsers.babel.parse),
  },
  // Enhanced TypeScript parser to handle SQL template literals
  'typescript-sql': {
    ...typescriptParsers.typescript,
    parse: SQLParser.parseEmbedded(typescriptParsers.typescript.parse),
  },
};

export const printers = {
  'sql-ast': {
    print,
  },
};

// Define the SQL languages for file handling
export const languages = [
  {
    name: 'SQL',
    parsers: ['sql'],
    extensions: ['.sql'],
    vscodeLanguageIds: ['sql'],
  },
];

// Default options for SQL formatting
export const options = {};

// Define the name of the plugin
export const name = 'prettier-sql';