import { SQLParser } from "./parser";
import { print } from "./printer";

export const parsers = {
    // Parser for standalone SQL files
    sql: {
        parse: SQLParser.parse.bind(SQLParser),
        astFormat: "sql-ast",
        locStart: SQLParser.locStart.bind(SQLParser),
        locEnd: SQLParser.locEnd.bind(SQLParser),
    },
};

export const printers = {
    "sql-ast": {
        print,
    },
};

// Define the SQL languages for file handling
export const languages = [
    {
        name: "SQL",
        parsers: ["sql"],
        extensions: [".sql"],
        vscodeLanguageIds: ["sql"],
    },
];

// Default options for SQL formatting
export const options = {};

// Define the name of the plugin
export const name = "prettier-sql";
