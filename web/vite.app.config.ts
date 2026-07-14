import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// vendor groups split off into their own chunks so the main bundle stays small
// and heavy libs (Semi-UI, xterm, markdown) can be cached independently
const VENDOR_CHUNKS: Record<string, RegExp> = {
  "vendor-semi": /node_modules\/@douyinfe\/semi-/,
  "vendor-xterm": /node_modules\/@xterm\//,
  "vendor-markdown": /node_modules\/(react-markdown|remark-|micromark|mdast-|hast-|unist-|unified|vfile|character-entities|decode-named-character-reference|trim-lines|comma-separated-tokens|space-separated-tokens|property-information|html-url-attributes|zwitch|bail|is-plain-obj|trough|ccount|escape-string-regexp|markdown-table|longest-streak|html-void-elements|stringify-entities|web-namespaces)/,
  "vendor-icons": /node_modules\/lucide-react/,
  "vendor-react": /node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//,
};

export default defineConfig({
  root: "app",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist-app",
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          for (const [name, pattern] of Object.entries(VENDOR_CHUNKS)) {
            if (pattern.test(id)) return name;
          }
          return undefined;
        },
      },
    },
  },
});
