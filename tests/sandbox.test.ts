import prettier from "prettier";
import { describe, test } from "vitest";
import * as sqlPlugin from "../src";
import fs from "fs";
import path from "path";

// This is a special test file for quick sandbox testing
describe("SANDBOX - Manual Testing", () => {
    test("Format sandbox.sql with chunk debugging", async () => {
        const sandboxPath = path.join(process.cwd(), "sandbox.sql");
        
        if (!fs.existsSync(sandboxPath)) {
            console.log("❌ sandbox.sql not found! Please create it first.");
            return;
        }

        const sqlContent = fs.readFileSync(sandboxPath, "utf8");
        console.log(`📄 Processing SQL file: ${sqlContent.length} characters, ${sqlContent.split('\n').length} lines`);
        
        // Split into statements by semicolons but handle comments properly
        const statements = [];
        let currentStatement = '';
        let pendingComments = '';
        
        for (const line of sqlContent.split('\n')) {
            const trimmedLine = line.trim();
            
            // Handle comment lines
            if (trimmedLine.startsWith('--') || trimmedLine.startsWith('/*')) {
                pendingComments += line + '\n';
                continue;
            }
            
            // Handle empty lines
            if (trimmedLine === '') {
                if (currentStatement.trim()) {
                    currentStatement += line + '\n';
                } else {
                    pendingComments += line + '\n';
                }
                continue;
            }
            
            // Handle SQL lines
            currentStatement += pendingComments + line + '\n';
            pendingComments = '';
            
            // Check if statement is complete (ends with semicolon)
            if (trimmedLine.endsWith(';')) {
                const finalStatement = currentStatement.trim();
                if (finalStatement) {
                    statements.push(finalStatement);
                }
                currentStatement = '';
            }
        }
        
        // Add any remaining statement
        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }
        
        console.log(`📊 Found ${statements.length} statements`);
        
        let successCount = 0;
        let errorStatement = '';
        let errorMessage = '';
        
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i].trim();
            
            // Skip empty statements
            if (!statement) continue;
            
            try {
                console.log(`🔍 Testing statement ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);
                
                await prettier.format(statement, {
                    plugins: [sqlPlugin],
                    parser: "sql",
                    tabWidth: 4,
                });
                
                successCount++;
                console.log(`✅ Statement ${i + 1} formatted successfully`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`❌ Statement ${i + 1} FAILED:`, errorMsg);
                console.log('\n📋 Problematic statement:');
                console.log('='.repeat(80));
                console.log(statement);
                console.log('='.repeat(80));
                
                errorStatement = statement;
                errorMessage = errorMsg;
                break; // Stop at first error for analysis
            }
        }
        
        console.log(`\n📈 Results: ${successCount}/${statements.length} statements formatted successfully`);
        
        if (errorStatement) {
            throw new Error(`Failed at statement ${successCount + 1}: ${errorMessage}\n\nProblematic statement:\n${errorStatement}`);
        }
    });
});