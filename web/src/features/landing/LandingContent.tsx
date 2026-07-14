import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  CircleDot,
  ClipboardCheck,
  Code2,
  Crosshair,
  Database,
  FileCheck2,
  FileSearch,
  FolderKanban,
  GitBranch,
  Layers3,
  LockKeyhole,
  Network,
  PackageCheck,
  Radio,
  Route,
  Server,
  ShieldCheck,
  SquareTerminal,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  EGRESS_PROXY_TYPE_VALUES,
  SANDBOX_CONTAINER_EGRESS_MODE,
} from "../../shared/api/generated/constants";
import { cx } from "../../shared/lib/className";
import { formatEnumLabel } from "../../shared/lib/labels";
import { landingDocsOverviewUrl, landingRepositoryUrl } from "./landingConfig";

const egressModes = [
  formatEnumLabel(SANDBOX_CONTAINER_EGRESS_MODE.DIRECT),
  ...EGRESS_PROXY_TYPE_VALUES.map((type) => type.toUpperCase()),
  formatEnumLabel(SANDBOX_CONTAINER_EGRESS_MODE.TOR),
];

const operationSignals = [
  { label: "Recon", detail: "Correlate the authorized surface", code: "MAP", icon: Network },
  { label: "Code audit", detail: "Trace data and trust boundaries", code: "TRACE", icon: Code2 },
  { label: "Validation", detail: "Confirm impact in isolation", code: "PROVE", icon: ShieldCheck },
];

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
    text: "Manages authenticated resources for users, sessions, WorkProjects, Knowledges, managed hosts, sandbox images, containers, egress proxies, and system configuration.",
    icon: Braces,
    items: ["Identity and access", "Resource administration", "Session entry"],
  },
  {
    title: "Runtime Plane",
    kicker: "Agent sessions",
    text: "Coordinates lead and specialist Agents, enriches task inputs with LightRAG context, streams session activity, and resumes long-running work when results become available.",
    icon: Workflow,
    items: ["Session runtime", "Agent graph", "Replayable timeline"],
  },
  {
    title: "Evidence Plane",
    kicker: "WorkProject",
    text: "Preserves assessment scope, assets, findings, relationship graph edges, attack paths, tasks, and Agent summaries as durable project evidence.",
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
    text: "Coordinates authenticated access to sessions, projects, knowledge documents, sandbox resources, and users.",
    icon: Braces,
  },
  {
    title: "Session runtime",
    text: "Runs the selected Agent team, streams live progress, and preserves work across long-running tasks.",
    icon: Bot,
  },
  {
    title: "Retrieval context",
    text: "For task-oriented inputs, LightRAG retrieves matching original document chunks and graph context before Agent execution.",
    icon: Database,
  },
  {
    title: "Persistence",
    text: "PostgreSQL retains session timelines, project evidence, LightRAG documents, vectors, graph data, and task state.",
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
  { title: "Playground", text: "Live transcript, Agent selection, streaming state, subagent panel, and sandbox actions.", icon: Activity },
  { title: "Work Projects", text: "Project metadata, owners, scoped assets, sessions, records, graph, and attack paths.", icon: FolderKanban },
  { title: "Knowledges", text: "Parallel document ingestion, vector inspection, semantic retrieval, and progressive knowledge graph exploration.", icon: Database },
  { title: "Host Management", text: "Docker host inventory for distributing sandbox workloads across managed infrastructure.", icon: Server },
  { title: "Egress Proxies", text: "Managed HTTP, HTTPS, and SOCKS5 upstreams for container-level outbound routing.", icon: Network },
  { title: "Sandbox Images", text: "Reusable sandbox baselines with skills, security tools, browser access, and control services.", icon: Boxes },
  { title: "Sandbox Containers", text: "Managed runtime instances with ownership, lifecycle, port access, browser review, and outbound policy.", icon: SquareTerminal },
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
    text: "Chrome automation, noVNC review, managed Python environments, and integrated SecLists wordlists.",
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
          <p>A control-plane-oriented platform for authorized penetration testing, vulnerability discovery, code auditing, and security research.</p>
          <div className="landing-actions">
            <ActionLink action={primaryAction} primary />
            <ActionLink action={{ label: "GitHub", href: landingRepositoryUrl, external: true }} icon={GitBranch} ghost />
          </div>
        </div>
        <OperationMeshPanel />
      </section>

      <Section
        eyebrow="Architecture planes"
        title="The system separates management, runtime, evidence, and execution concerns."
        description="The architecture connects authenticated administration, Agent collaboration, durable WorkProject evidence, managed sandbox infrastructure, and PostgreSQL persistence."
      >
        <div className="landing-card-grid landing-card-grid-4">
          {planes.map((item) => <Card key={item.title} item={item} accent />)}
        </div>
      </Section>

      <Section eyebrow="Runtime flow" title="Live interaction, background work, and replay remain connected throughout an assessment.">
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
          <SandboxNetworkMap />
          <div className="landing-panel landing-topology-copy">
            <h3>Sandbox resources provide a managed execution boundary.</h3>
            <p>Operators and Agents work through selected running containers. The same boundary supports command execution, Shell, files, browser/noVNC review, sandbox-local skills, preloaded security tooling, and container-level network identity.</p>
            <p>Egress policy is applied inside the container through a local proxy and can be routed directly, through managed HTTP, HTTPS, and SOCKS5 upstreams, or through Tor.</p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Sandbox toolchain"
        title="The default sandbox image provides a ready-to-use security workspace."
        description="Sandbox-local skills organize workflows for reconnaissance, web discovery, credential checks, reverse analysis, browser review, Python tasks, and wordlist use."
      >
        <div className="landing-card-grid landing-card-grid-3">
          {sandboxToolchain.map((item) => <Card key={item.title} item={item} accent />)}
        </div>
      </Section>

      <Section eyebrow="Operator workbench" title="A unified console brings assessment, knowledge, and execution resources into one workspace.">
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
          <a className="landing-inline-link" href={landingDocsOverviewUrl} target="_blank" rel="noopener noreferrer">
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

function OperationMeshPanel() {
  return (
    <div className="landing-ops-panel" aria-label="Red team collaboration model">
      <div className="landing-ops-panel-heading">
        <div>
          <span className="page-eyebrow">Operation mesh</span>
          <h2>One authorized scope. Six coordinated specialist roles.</h2>
        </div>
        <span className="landing-live-status"><i /> Community built</span>
      </div>

      <div className="landing-ops-console">
        <div className="landing-ops-commandbar">
          <span><SquareTerminal size={15} /> OP / AUTHORIZED-ASSESSMENT</span>
          <span><Radio size={14} /> SIGNAL ACTIVE</span>
        </div>

        <div className="landing-ops-overview">
          <div className="landing-target-pane">
            <div className="landing-console-label">
              <span><Crosshair size={14} /> Authorized surface</span>
              <strong>Scope locked</strong>
            </div>
            <div className="landing-target-radar" aria-hidden="true">
              <i className="landing-radar-ring landing-radar-ring-1" />
              <i className="landing-radar-ring landing-radar-ring-2" />
              <i className="landing-radar-axis landing-radar-axis-x" />
              <i className="landing-radar-axis landing-radar-axis-y" />
              <i className="landing-radar-sweep" />
              <i className="landing-radar-pip landing-radar-pip-1" />
              <i className="landing-radar-pip landing-radar-pip-2" />
              <i className="landing-radar-pip landing-radar-pip-3" />
              <Crosshair size={26} />
            </div>
            <div className="landing-target-states">
              <span><i /> Boundary enforced</span>
              <span><i /> Evidence streaming</span>
            </div>
          </div>

          <div className="landing-signal-pane">
            <div className="landing-console-label">
              <span><Activity size={14} /> Action streams</span>
              <strong>Coordinated</strong>
            </div>
            <div className="landing-signal-list">
              {operationSignals.map(({ code, detail, icon: Icon, label }) => (
                <div className="landing-signal-row" key={label}>
                  <Icon size={17} />
                  <div>
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </div>
                  <small>{code}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-ops-agent-mesh">
          <div className="landing-console-label">
            <span><UsersRound size={14} /> Specialist relay</span>
            <strong>Shared timeline</strong>
          </div>
          <div className="landing-ops-agent-network">
            <div className="landing-ops-lead-node">
              <Workflow size={18} />
              <span><strong>{agents[0].code}</strong> orchestration lead</span>
            </div>
            <div className="landing-ops-specialists">
              {agents.slice(1).map(({ code, icon: Icon, role }) => (
                <div className="landing-ops-specialist" key={code} title={role}>
                  <Icon size={16} />
                  <strong>{code}</strong>
                  <span>{role.replace(" Engineer", "")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="landing-community-strip">
          <span><GitBranch size={15} /> Open-source core</span>
          <span><PackageCheck size={15} /> Reusable skills</span>
          <span><UsersRound size={15} /> Community practice</span>
          <span><FileCheck2 size={15} /> Transparent evidence</span>
        </div>
      </div>
    </div>
  );
}

function SandboxNetworkMap() {
  const managedNodes = [
    { name: "Managed node 01", workload: "Active sandbox", icon: SquareTerminal },
    { name: "Managed node 02", workload: "Ready capacity", icon: Boxes },
  ];

  return (
    <div className="landing-topology-map" aria-label="Distributed sandbox and egress topology">
      <div className="landing-network-heading">
        <span><Network size={15} /> Distributed execution fabric</span>
        <strong><i /> Policy online</strong>
      </div>

      <div className="landing-network-canvas">
        <div className="landing-network-control">
          <span className="landing-network-kicker">Control</span>
          <div className="landing-network-primary-node">
            <FolderKanban size={20} />
            <strong>Project session</strong>
            <span>Operator + Agent team</span>
          </div>
          <div className="landing-network-tags">
            <span>Scoped</span>
            <span>Audited</span>
          </div>
        </div>

        <NetworkConnector label="mTLS" />

        <div className="landing-host-fabric">
          <div className="landing-host-fabric-heading">
            <span><Server size={15} /> Managed host pool</span>
            <small>Scheduler ready</small>
          </div>
          <div className="landing-host-grid">
            {managedNodes.map(({ icon: Icon, name, workload }) => (
              <div className="landing-host-node" key={name}>
                <div>
                  <Server size={16} />
                  <strong>{name}</strong>
                  <i />
                </div>
                <span><Icon size={14} /> {workload}</span>
                <small>Isolated Docker runtime</small>
              </div>
            ))}
          </div>
        </div>

        <NetworkConnector label="policy" />

        <div className="landing-network-egress">
          <span className="landing-network-kicker">Egress</span>
          <div className="landing-egress-gateway">
            <Route size={19} />
            <strong>Route gateway</strong>
            <span>Per-container identity</span>
          </div>
          <div className="landing-egress-modes">
            {egressModes.map((mode) => <span key={mode}>{mode}</span>)}
          </div>
        </div>
      </div>

      <div className="landing-community-rail">
        <span><GitBranch size={15} /> Community toolchain</span>
        <ArrowRight size={14} aria-hidden="true" />
        <span><PackageCheck size={15} /> Reproducible image</span>
        <ArrowRight size={14} aria-hidden="true" />
        <span><ShieldCheck size={15} /> Scoped execution</span>
      </div>
    </div>
  );
}

function NetworkConnector({ label }: { label: string }) {
  return (
    <div className="landing-network-connector" aria-hidden="true">
      <span>{label}</span>
      <i />
      <CircleDot size={11} />
    </div>
  );
}

function Card({ accent = false, arrow, index, item }: { accent?: boolean; arrow?: boolean; index?: number; item: CardItem }) {
  const Icon = item.icon;
  return (
    <article className={cx("landing-card", accent && "landing-card-accent")}>
      <div className="landing-card-topline">
        <span>{item.kicker ?? (index != null ? String(index + 1).padStart(2, "0") : "Module")}</span>
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
      <span className="landing-agent-state"><i /> Specialist profile</span>
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
