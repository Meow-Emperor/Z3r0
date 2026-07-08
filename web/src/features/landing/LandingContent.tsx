import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  ClipboardCheck,
  Code2,
  Database,
  FileCheck2,
  FileSearch,
  FolderKanban,
  GitBranch,
  Layers3,
  LockKeyhole,
  Network,
  Route,
  Server,
  ShieldCheck,
  SquareTerminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cx } from "../../shared/lib/className";

const repositoryUrl = "https://github.com/yv1ing/Z3r0";
const docsOverviewUrl = "https://github.com/yv1ing/Z3r0/blob/main/docs/en/guide/overview.md";
const egressModes = ["Direct", "HTTP", "HTTPS", "SOCKS5"];

type LandingPrimaryAction = {
  label: string;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
};

type LandingContentProps = {
  logoSrc: string;
  primaryAction: LandingPrimaryAction;
};

type CardItem = {
  title: string;
  text: string;
  icon: LucideIcon;
  kicker?: string;
  items?: string[];
};

type AgentItem = {
  code: string;
  name: string;
  role: string;
  detail: string;
  icon: LucideIcon;
};

const planes: CardItem[] = [
  {
    title: "Control Plane",
    kicker: "FastAPI",
    text: "Owns authenticated resource management for users, sessions, WorkProjects, managed hosts, sandbox images, containers, egress proxies, and system configuration.",
    icon: Braces,
    items: ["REST resources", "WebSocket session entry", "Access and ownership"],
  },
  {
    title: "Runtime Plane",
    kicker: "Agent sessions",
    text: "Coordinates lead and specialist agents, streams normalized events, preserves timeline continuity, and resumes long-running work when results become available.",
    icon: Workflow,
    items: ["Session runtime", "Agent graph", "Replayable timeline"],
  },
  {
    title: "Evidence Plane",
    kicker: "WorkProject",
    text: "Keeps assessment state outside model context through durable assets, findings, relationship graph edges, attack paths, tasks, and agent summaries.",
    icon: FileCheck2,
    items: ["Assets and scope", "Findings and graph", "Attack paths"],
  },
  {
    title: "Execution Plane",
    kicker: "Sandbox pool",
    text: "Provides isolated Docker-based execution with shell, files, noVNC/browser review, command execution, sandbox-local skills, a preloaded security toolchain, and container-level outbound network policy.",
    icon: SquareTerminal,
    items: ["Managed Docker hosts", "Sandbox control proxy", "Preloaded toolchain"],
  },
];

const runtimePath: CardItem[] = [
  {
    title: "Operator workbench",
    text: "The React console combines chat, project records, graph review, sandbox selection, terminal, files, and noVNC.",
    icon: Layers3,
  },
  {
    title: "Control plane",
    text: "FastAPI receives REST and WebSocket traffic and resolves session, project, sandbox, and user boundaries.",
    icon: Braces,
  },
  {
    title: "Session runtime",
    text: "The runtime executes the selected agent graph and turns provider output into application-level events.",
    icon: Bot,
  },
  {
    title: "Tool layer",
    text: "Agent work reaches project records, knowledge, delegated specialists, or selected sandbox resources.",
    icon: Workflow,
  },
  {
    title: "Persistence",
    text: "PostgreSQL stores timeline frames, project evidence, resource state, and background task state.",
    icon: Database,
  },
];

const evidenceNodes: CardItem[] = [
  { title: "Scope", text: "Declared targets and project boundaries", icon: ShieldCheck },
  { title: "Assets", text: "Services, domains, networks, binaries", icon: Boxes },
  { title: "Relationships", text: "Structural and offensive graph edges", icon: GitBranch },
  { title: "Findings", text: "Proof, impact, severity, status", icon: FileSearch },
  { title: "Attack paths", text: "Ordered traversal from access to impact", icon: Route },
  { title: "Review", text: "Records, graph view, timeline replay", icon: ClipboardCheck },
];

const workbenchSurfaces: CardItem[] = [
  { title: "Playground", text: "Live transcript, agent selection, streaming state, subagent panel, and sandbox actions.", icon: Activity },
  { title: "Work Projects", text: "Project metadata, owners, scoped assets, sessions, records, graph, and attack paths.", icon: FolderKanban },
  { title: "Host Management", text: "Docker host inventory for distributing sandbox workloads across managed infrastructure.", icon: Server },
  { title: "Egress Proxies", text: "Managed HTTP, HTTPS, and SOCKS5 upstreams for container-level outbound routing.", icon: Network },
  { title: "Sandbox Images", text: "Reusable execution baselines that define the sandbox-local skills, security tools, browser support, and control proxy available to containers.", icon: Boxes },
  { title: "Sandbox Containers", text: "Runtime instances with owner, status, ports, control proxy token, and egress mode.", icon: SquareTerminal },
];

const sandboxToolchain: CardItem[] = [
  {
    title: "Recon and DNS",
    text: "Passive discovery, deeper asset intelligence, batch DNS validation, and targeted ownership triage.",
    icon: Network,
    items: ["subfinder", "amass", "dnsx", "dig / whois"],
  },
  {
    title: "Web discovery",
    text: "HTTP liveness, fingerprinting, content discovery, virtual-host checks, service scanning, and injection validation.",
    icon: FileSearch,
    items: ["httpx", "observer_ward", "ffuf / gobuster", "nmap / sqlmap"],
  },
  {
    title: "Credential testing",
    text: "Bounded authentication checks with explicit scope, account limits, and lockout-aware execution.",
    icon: LockKeyhole,
    items: ["hydra", "SecLists directories", "rate-conscious workflows"],
  },
  {
    title: "Reverse and pwn",
    text: "ELF triage, debugger state, runtime traces, exploit prototyping, and mitigation review.",
    icon: Code2,
    items: ["gdb + Pwndbg", "strace / ltrace", "pwntools", "checksec from pwntools"],
  },
  {
    title: "Mobile and firmware",
    text: "Android decompilation, resource/smali inspection, firmware triage, and headless binary analysis.",
    icon: Boxes,
    items: ["jadx", "apktool", "binwalk", "Ghidra"],
  },
  {
    title: "Browser, Python, wordlists",
    text: "Chrome automation, noVNC review, uv-first Python workflows, and a build-time SecLists corpus.",
    icon: SquareTerminal,
    items: ["agent-browser-cli", "uv / uvx", "SecLists", "sandbox skills"],
  },
];

const agents: AgentItem[] = [
  { code: "cso", name: "Z3r0", role: "Chief Security Lead", detail: "Task decomposition, team coordination, result integration.", icon: Workflow },
  { code: "cae", name: "V3ra", role: "Code Audit Engineer", detail: "Source code auditing, dependency review, remediation verification.", icon: ClipboardCheck },
  { code: "cie", name: "L1ly", role: "Intelligence Gathering Engineer", detail: "Intelligence gathering, asset discovery, relationship mapping.", icon: FileSearch },
  { code: "cpe", name: "Fr4nk", role: "Penetration Testing Engineer", detail: "Penetration testing, vulnerability validation, impact confirmation.", icon: ShieldCheck },
  { code: "cre", name: "J4m3", role: "Reverse Analysis Engineer", detail: "Reverse analysis, firmware disassembly, binary unpacking.", icon: Code2 },
  { code: "cce", name: "Nu1L", role: "Cryptography Engineer", detail: "Cryptographic analysis, key review, security assessment.", icon: LockKeyhole },
];

export function LandingContent({ logoSrc, primaryAction }: LandingContentProps) {
  return (
    <main className="landing-page">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-scanline" aria-hidden="true" />

      <section className="landing-hero" aria-label="Z3r0 landing page">
        <div className="landing-hero-copy">
          <img className="landing-hero-logo" src={logoSrc} width="1000" height="1000" alt="Z3r0 logo" />
          <span className="page-eyebrow">Open-source red team collaboration workbench</span>
          <h1>Red-Team Workbench</h1>
          <p>A control-plane-oriented platform for authorized penetration testing, vulnerability discovery, code auditing, and security research.</p>
          <div className="landing-actions">
            <ActionLink action={primaryAction} primary />
            <ActionLink action={{ label: "GitHub", href: repositoryUrl, external: true }} icon={GitBranch} ghost />
          </div>
        </div>
        <ArchitecturePanel />
      </section>

      <Section
        eyebrow="Architecture planes"
        title="The system separates management, runtime, evidence, and execution concerns."
        description="Each plane maps to real application resources: API routes and services, session runtime, WorkProject records, Docker infrastructure, sandbox control proxy, and PostgreSQL persistence."
      >
        <div className="landing-card-grid landing-card-grid-4">
          {planes.map((item) => <Card key={item.title} item={item} accent />)}
        </div>
      </Section>

      <Section eyebrow="Runtime flow" title="Live interaction, background work, and replay share one application event model.">
        <div className="landing-card-grid landing-card-grid-5">
          {runtimePath.map((item, index) => <Card key={item.title} item={item} index={index} arrow={index < runtimePath.length - 1} />)}
        </div>
      </Section>

      <Section
        eyebrow="Evidence model"
        title="WorkProject turns transient investigation output into durable review material."
        description="Assets are graph nodes, relationships are directed edges, findings carry proof and impact, and attack paths reconstruct how access or impact progresses through the graph."
      >
        <div className="landing-card-grid landing-card-grid-6">
          {evidenceNodes.map((item, index) => <Card key={item.title} item={item} index={index} arrow={index < evidenceNodes.length - 1} />)}
        </div>
      </Section>

      <Section eyebrow="Distributed sandbox and egress" title="Execution resources are managed as infrastructure with a unified outbound policy surface.">
        <div className="landing-sandbox-topology">
          <div className="landing-topology-map" aria-label="Sandbox and egress topology">
            <div className="landing-topology-node landing-topology-project">WorkProject / Session</div>
            <div className="landing-topology-hosts">
              {["Managed Host A", "Managed Host B"].map((title) => (
                <div className="landing-topology-node" key={title}>
                  <strong>{title}</strong>
                  <span>Docker sandbox</span>
                </div>
              ))}
            </div>
            <div className="landing-topology-node"><span>Sandbox control proxy</span><strong>shell / files / noVNC / egress API</strong></div>
            <div className="landing-topology-node"><span>In-container egress proxy</span><strong>127.0.0.1:8118</strong></div>
            <div className="landing-egress-modes">{egressModes.map((mode) => <span key={mode}>{mode}</span>)}</div>
          </div>
          <div className="landing-panel landing-topology-copy">
            <h3>Sandboxing is a managed resource boundary, not an incidental command runner.</h3>
            <p>Operators and agents work through selected running containers. The same boundary supports command execution, shell, files, browser/noVNC review, sandbox-local skills, preloaded security tooling, and container-level network identity.</p>
            <p>Egress policy is applied inside the container through a local proxy and can be routed directly or through managed HTTP, HTTPS, and SOCKS5 upstreams.</p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Sandbox toolchain"
        title="The default sandbox image ships as a ready security workspace, not a bare container."
        description="Tooling is grouped behind sandbox-local skills so agents can choose the right workflow for recon, web discovery, credential checks, reverse analysis, browser review, Python tasks, and wordlist use without treating overlapping tools as interchangeable."
      >
        <div className="landing-card-grid landing-card-grid-3">
          {sandboxToolchain.map((item) => <Card key={item.title} item={item} accent />)}
        </div>
      </Section>

      <Section eyebrow="Operator workbench" title="The frontend exposes the same resource model used by the backend control plane.">
        <div className="landing-card-grid landing-card-grid-3">
          {workbenchSurfaces.map((item) => <Card key={item.title} item={item} />)}
        </div>
      </Section>

      <Section eyebrow="Expert team" title="Specialist roles mirror the division of labor in professional security assessments.">
        <div className="landing-card-grid landing-card-grid-3">
          {agents.map((agent) => <AgentCard key={agent.code} agent={agent} />)}
        </div>
      </Section>

      <Section className="landing-security" eyebrow="Operational boundary" title="Authorized use only.">
        <div className="landing-panel landing-boundary">
          <p>Z3r0 is intended only for lawful, explicitly authorized security testing, risk assessment, code auditing, and research. It does not grant permission to test, scan, access, or affect any third-party system, network, service, account, or data.</p>
          <a className="landing-inline-link" href={docsOverviewUrl} target="_blank" rel="noopener noreferrer">
            Read the documentation
            <ArrowRight size={16} />
          </a>
        </div>
      </Section>
    </main>
  );
}

function Section({
  children,
  className = "",
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className={cx("landing-section", className)}>
      <div className="landing-section-heading">
        <span className="page-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ArchitecturePanel() {
  return (
    <div className="landing-panel landing-architecture-panel" aria-label="Z3r0 architecture overview">
      <div className="landing-panel-heading">
        <span className="page-eyebrow">System model</span>
        <h2>Workbench, API, runtime, evidence, sandbox, egress, and persistence are explicit layers.</h2>
      </div>
      <div className="landing-architecture-canvas">
        <div className="landing-diagram-node landing-diagram-wide">Authorized Operator</div>
        <div className="landing-api-row">
          <div className="landing-diagram-node">React Workbench</div>
          <ArrowRight size={17} />
          <div className="landing-diagram-node">FastAPI Control Plane</div>
        </div>
        <div className="landing-plane-row">
          {planes.map(({ icon: Icon, title }) => (
            <div className="landing-diagram-node landing-plane-node" key={title}>
              <Icon size={18} />
              <span>{title}</span>
            </div>
          ))}
        </div>
        <div className="landing-diagram-node landing-diagram-wide">
          <Database size={18} />
          <span>PostgreSQL persistence</span>
        </div>
      </div>
    </div>
  );
}

function Card({ accent = false, arrow, index, item }: { accent?: boolean; arrow?: boolean; index?: number; item: CardItem }) {
  const Icon = item.icon;
  return (
    <article className={cx("landing-card", accent && "landing-card-accent")}>
      <div className="landing-card-topline">
        <span>{item.kicker ?? (index != null ? String(index + 1).padStart(2, "0") : "")}</span>
        <Icon size={20} />
      </div>
      <h3>{item.title}</h3>
      <p>{item.text}</p>
      {item.items ? <ul>{item.items.map((entry) => <li key={entry}>{entry}</li>)}</ul> : null}
      {arrow ? <ArrowRight className="landing-card-arrow" size={18} aria-hidden="true" /> : null}
    </article>
  );
}

function AgentCard({ agent }: { agent: AgentItem }) {
  const Icon = agent.icon;
  return (
    <article className="landing-card landing-card-agent">
      <div className="landing-card-topline">
        <span>{agent.code}</span>
        <Icon size={18} />
      </div>
      <strong>{agent.name}</strong>
      <h3>{agent.role}</h3>
      <p>{agent.detail}</p>
    </article>
  );
}

function ActionLink({ action, ghost = false, icon: Icon = ShieldCheck, primary = false }: {
  action: LandingPrimaryAction;
  ghost?: boolean;
  icon?: LucideIcon;
  primary?: boolean;
}) {
  const className = cx(
    "landing-action-link",
    primary ? "landing-action-primary" : ghost ? "landing-action-ghost" : "landing-action-secondary",
  );

  const content = (
    <>
      <Icon size={17} />
      <span>{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <a className={className} href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? "noopener noreferrer" : undefined}>
        {content}
      </a>
    );
  }

  return <button className={className} type="button" onClick={action.onSelect}>{content}</button>;
}
