import { defineConfig } from "vitepress";

const base = "/Z3r0/";

const enNav = [
  { text: "Home", link: "/en/" },
  { text: "Quick start", link: "/en/guide/quick-start" },
  { text: "Community", link: "/en/guide/community" },
];

const enSidebar = {
  "/en/guide/": [
    {
      text: "Guide",
      items: [
        { text: "Overview", link: "/en/guide/overview" },
        { text: "Quick start", link: "/en/guide/quick-start" },
        { text: "First use", link: "/en/guide/first-use" },
        { text: "Community", link: "/en/guide/community" },
      ],
    },
  ],
};

export default defineConfig({
  base,
  title: "Z3r0 documentation",
  description: "AI-native red-team workbench for authorized penetration testing and vulnerability research, with specialist agents, sandboxed tooling, evidence records, and replayable timelines.",
  appearance: "force-dark",
  lastUpdated: true,
  head: [
    ["link", { rel: "icon", type: "image/png", href: `${base}z3r0-logo.png` }],
    ["link", { rel: "apple-touch-icon", href: `${base}z3r0-logo.png` }],
  ],
  markdown: {
    config(md) {
      const fence = md.renderer.rules.fence
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        const lang = token.info.trim().split(/\s+/)[0]
        if (lang === 'mermaid') {
          return `<MermaidDiagram code="${encodeURIComponent(token.content)}" />`
        }
        return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options)
      }
    }
  },
  themeConfig: {
    logo: '/z3r0-logo.png',
    outline: { level: [2, 3], label: "On this page" },
    socialLinks: [{ icon: "github", link: "https://github.com/yv1ing/Z3r0" }],
  },
  locales: {
    en: {
        label: "English",
        lang: "en-US",
        link: "/en/",
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outline: { level: [2, 3], label: "Contents" },
      }
    }
  }
})
