# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This repository contains a TypeScript project that implements a prettier plugin that formats SQL code.

The parser is purly node-sql-parser, while the printer is a very opinionated way to print SQL code with a focus on readability and consistency.

## Key Files
- `src/index.ts`: Main entry point for the prettier plugin.
- `src/printer.ts`: Contains the logic for formatting SQL code.
- `src/parser.ts`: Handles parsing SQL code using node-sql-parser, along with some custom logic.

## Commands

- ⚠️ **NEVER run `npm run build`** - The user will build when needed
- Dev/Watch mode: `npm run dev`
- Test: `npm run test`
- Run single test: `npx vitest run tests/select.test.ts`
- Lint: `npm run lint`
- Type checking: `npm run typecheck`
- Format code: `npm run pretty`

## Development Guidelines

- **NEVER run build commands** - User handles building
- **Always work in TypeScript** - Never suggest JavaScript alternatives
- **Use vitest for testing** - This is the test framework for this project
- **Stick to the existing architecture** - Parser/printer pattern with node-sql-parser

## Code Style

- Tab width: 4 spaces
- Print width: 120 characters
- Typescript with strict type checking
- ES modules (import/export)
- Naming: camelCase for variables/functions, PascalCase for classes
