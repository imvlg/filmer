import { defineConfig } from "vite";
import ts from "typescript";
import { minify } from "terser";

// In-process transpilation also works on hosts that restrict child processes.
export default defineConfig({
  base: "./",
  resolve: { preserveSymlinks: true },
  esbuild: false,
  plugins: [
    {
      name: "filmer-minify",
      apply: "build",
      async renderChunk(code) {
        return { code: (await minify(code, { module: true })).code, map: null };
      },
    },
    {
      name: "filmer-typescript",
      enforce: "pre",
      transform(source, id) {
        source = source.replace(
          /process\.env\.NODE_ENV/g,
          JSON.stringify(process.env.NODE_ENV || "development"),
        );
        if (!/\.tsx?(?:\?.*)?$/.test(id) || id.includes("node_modules"))
          return source;
        return ts.transpileModule(source, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            sourceMap: true,
          },
          fileName: id,
        }).outputText;
      },
    },
  ],
  build: { minify: false, cssMinify: false },
});
