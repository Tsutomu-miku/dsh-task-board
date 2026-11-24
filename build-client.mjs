import { build } from "esbuild"

await build({
  entryPoints: ["src/client.tsx"],
  outfile: "dist/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  external: ["react", "react-dom"],
  loader: { ".svg": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-task-board", factory(require) { const module = { exports: {} };' },
  footer: { js: "return module.exports; } });" },
})
