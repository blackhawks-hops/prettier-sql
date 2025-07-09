# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This repository contains a TypeScript project that implements a prettier plugin that formats SQL code.

The parser is purly node-sql-parser, while the printer is a very opinionated way to print SQL code with a focus on readability and consistency.

## Commands

- Build: `npm run build`
- Dev/Watch mode: `npm run dev`
- Test: `npm run test`
- Run single test: `npx vitest run tests/select.test.ts`
- Lint: `npm run lint`
- Type checking: `npm run typecheck`
- Format code: `npm run pretty`

## Code Style

- Tab width: 4 spaces
- Print width: 120 characters
- Typescript with strict type checking
- ES modules (import/export)
- Naming: camelCase for variables/functions, PascalCase for classes
