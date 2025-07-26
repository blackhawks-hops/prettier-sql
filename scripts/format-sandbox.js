#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import prettier from 'prettier';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the root directory (one level up from scripts/)
const rootDir = path.join(__dirname, '..');
const sandboxPath = path.join(rootDir, 'sandbox.sql');
const pluginPath = path.join(rootDir, 'dist', 'index.js');

async function formatSandbox() {
    try {
        // Check if sandbox.sql exists
        if (!fs.existsSync(sandboxPath)) {
            console.error('❌ sandbox.sql not found! Please create it first.');
            process.exit(1);
        }

        // Check if plugin is built
        if (!fs.existsSync(pluginPath)) {
            console.error('❌ Plugin not built! Run "npm run build" first.');
            process.exit(1);
        }

        // Read the SQL file
        const sqlContent = fs.readFileSync(sandboxPath, 'utf8');
        
        console.log('📄 Original SQL:');
        console.log('=' .repeat(50));
        console.log(sqlContent);
        console.log('=' .repeat(50));

        // Import the plugin dynamically
        const sqlPlugin = await import(pluginPath);

        // Format with prettier
        const formatted = await prettier.format(sqlContent, {
            plugins: [sqlPlugin],
            parser: 'sql',
            tabWidth: 4
        });

        console.log('\n✨ Formatted SQL:');
        console.log('=' .repeat(50));
        console.log(formatted);
        console.log('=' .repeat(50));

        // If --write flag is passed, write back to file
        if (process.argv.includes('--write')) {
            fs.writeFileSync(sandboxPath, formatted);
            console.log('\n💾 Sandbox file updated!');
        }

    } catch (error) {
        console.error('❌ Error formatting SQL:', error.message);
        process.exit(1);
    }
}

formatSandbox();