import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, "src/index.ts"),
            },
            formats: ["cjs", "es"],
        },
        rollupOptions: {
            external: ["prettier"],
            output: {
                preserveModules: true,
                exports: "named",
                entryFileNames: "[name].js",
            },
        },
        outDir: "dist",
        sourcemap: true,
    },
    plugins: [
        dts({
            entryRoot: "src",
            tsconfigPath: "tsconfig.json",
        }),
    ],
    test: {
        globals: true,
        environment: "node",
    },
});
