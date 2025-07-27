import prettier from "prettier";
import { describe, test } from "vitest";
import * as sqlPlugin from "../src";
import fs from "fs";
import path from "path";

// This is a special test file for quick sandbox testing
describe("SANDBOX - Manual Testing", () => {
    test("Format sandbox.sql", async () => {
        const sandboxPath = path.join(process.cwd(), "sandbox.sql");
        
        if (!fs.existsSync(sandboxPath)) {
            console.log("❌ sandbox.sql not found! Please create it first.");
            return;
        }

        const sqlContent = fs.readFileSync(sandboxPath, "utf8");
        
        console.log("\n📄 Original SQL:");
        console.log("=".repeat(50));
        console.log(sqlContent);
        console.log("=".repeat(50));

        const formatted = await prettier.format(sqlContent, {
            plugins: [sqlPlugin],
            parser: "sql",
            tabWidth: 4,
        });

        console.log("\n✨ Formatted SQL:");
        console.log("=".repeat(50));
        console.log(formatted);
        console.log("=".repeat(50));
        
        // Uncomment the next line to write back to sandbox.sql
        // fs.writeFileSync(sandboxPath, formatted);
        // console.log("\n💾 Sandbox file updated!");
    });
});