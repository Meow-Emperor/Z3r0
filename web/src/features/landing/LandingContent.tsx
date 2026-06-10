import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Box,
  Braces,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Database,
  FileCheck2,
  FileSearch,
  Fingerprint,
  GitBranch,
  Layers3,
  LockKeyhole,
  MessageSquareCode,
  Repeat2,
  ShieldCheck,
  SquareTerminal,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

const repositoryUrl = "https://github.com/yv1ing/Z3r0";

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

type ArchitectureNode = {
  id: string;
  label: string;
  role: string;
  detail: string;
  points: string[];
  icon: LucideIcon;
};

const architectureNodes: ArchitectureNode[] = [
  {
    id: "operator",
    label: "Authorized Red-Team Operator",
    role: "Scoped Entry",
    detail: "The operator defines the red-team objective, authorization boundary, target scope, sandbox context, and review expectations.",
    points: [
      "Starts authorized penetration testing, vulnerability research, audit, or validation work from the browser.",
      "Reviews streamed reasoning, tool output, and final evidence records.",
      "Can manually review shell, screen, and files when a finding needs human verification.",
    ],
    icon: Fingerprint,
  },
  {
    id: "workbench",
    label: "React Red-Team Workbench",
    role: "Presentation Layer",
    detail: "The workbench is the user-facing surface for red-team sessions, resource management, event streams, and sandbox review.",
    points: [
      "Renders normalized thinking, text, tool, and subagent events in real time.",
      "Provides session lists, agent selection, sandbox binding, shell, files, and noVNC views.",
      "Depends on application REST and WebSocket contracts instead of model SDK internals.",
    ],
    icon: MessageSquareCode,
  },
  {
    id: "api",
    label: "FastAPI API",
    role: "API Layer",
    detail: "The API layer owns authentication, resource contracts, WebSocket entry points, and service boundaries.",
    points: [
      "Exposes REST resources for users, work projects, sandbox images, containers, agents, and sessions.",
      "Routes red-team turns into the active session pool and streams normalized events back to the frontend.",
      "Keeps request validation and response shaping outside the agent runtime.",
    ],
    icon: Braces,
  },
  {
    id: "runtime",
    label: "Agent Runtime",
    role: "Orchestration Layer",
    detail: "The runtime coordinates session lifecycle, interrupt-driven task execution, context projection, event normalization, timeline persistence, and compaction.",
    points: [
      "Creates or resumes sessions through AgentSessionPool and launches non-blocking instance drivers.",
      "Uses run_until_idle to run the initial turn, drain ready notifications, then stop without waiting on background work.",
      "Normalizes SDK output into stable application events and writes persistable frames to the timeline log.",
    ],
    icon: Workflow,
  },
  {
    id: "drivers",
    label: "Instance Drivers",
    role: "Async Scheduling Layer",
    detail: "Main and subagent instances are driven by short-lived, resumable loops that wake only when work is ready.",
    points: [
      "Main drivers stop after draining PENDING notifications instead of blocking on child work.",
      "Subagent drivers can relaunch after a claim race, go dormant while children run, or complete the task.",
      "Long sandbox commands resume the owning instance through the same notification path.",
    ],
    icon: Repeat2,
  },
  {
    id: "notifications",
    label: "Notification Obligations",
    role: "Liveness Layer",
    detail: "The notification table is the scheduler state for user messages, subagent completion, and sandbox async jobs.",
    points: [
      "AWAITING represents a background obligation that is still running.",
      "PENDING wakes the owning instance so it can integrate the result.",
      "PROCESSING, COMPLETED, FAILED, and CANCELED make cancellation and liveness checks deterministic.",
    ],
    icon: Zap,
  },
  {
    id: "agentGraph",
    label: "Session Agent Graph",
    role: "Capability Layer",
    detail: "AgentRegistry assembles a session-scoped graph from role specifications, knowledge, tools, model settings, and sandbox state.",
    points: [
      "Binds the coordinator and specialist agents to the current session.",
      "Mounts command tools only when an authorized running sandbox is available.",
      "Keeps specialist delegation, knowledge, and tool access scoped to the authorized red-team context.",
    ],
    icon: GitBranch,
  },
  {
    id: "record",
    label: "WorkProject Evidence Records",
    role: "Review Layer",
    detail: "Project-scoped records persist assets, findings, relationship edges, and attack paths outside model context.",
    points: [
      "Keeps assets, findings, relationship edges, and ordered attack paths reviewable.",
      "Supports live refresh, resumed reviews, and post-engagement reconstruction from stable records.",
      "Keeps durable facts out of summaries so agent context remains compact.",
    ],
    icon: FileCheck2,
  },
  {
    id: "sandbox",
    label: "Docker Sandbox",
    role: "Execution Layer",
    detail: "Sandbox containers provide the controlled execution boundary for agent tools and manual user review.",
    points: [
      "Runs commands, skills, shell sessions, browser workflows, file operations, and noVNC access.",
      "Returns structured command results to agents while preserving a user review path.",
      "Invalidates tool bindings when container state changes.",
    ],
    icon: Box,
  },
  {
    id: "tools",
    label: "Tool Surface",
    role: "Tool Layer",
    detail: "Tool mounting translates sandbox, knowledge, and skill capabilities into explicit agent-callable interfaces.",
    points: [
      "Separates unavailable tools from the active agent graph.",
      "Supports synchronous commands, turn-terminal async command dispatch, skills, and knowledge loading.",
      "Keeps command output structured so completed output can be read and replayed.",
    ],
    icon: SquareTerminal,
  },
  {
    id: "model",
    label: "Model Providers",
    role: "Model Layer",
    detail: "Model access stays behind role and runtime boundaries with configurable native OpenAI-compatible provider modes.",
    points: [
      "Allows model routing to be configured outside frontend code.",
      "Keeps provider details behind agent and runtime interfaces.",
      "Supports different model choices for coordinator and specialist roles.",
    ],
    icon: Bot,
  },
  {
    id: "store",
    label: "PostgreSQL Store",
    role: "Persistence Layer",
    detail: "PostgreSQL stores sessions, messages, metadata, delegated jobs, async command jobs, notification obligations, event logs, sandbox records, users, work projects, and project security records.",
    points: [
      "Persists long-running red-team work across browser refreshes and runtime recovery.",
      "Stores subagent task state, async job state, completion obligations, assets, findings, relationship edges, and attack paths.",
      "Provides the durable source for replay, compaction, and operational audit.",
    ],
    icon: Database,
  },
  {
    id: "eventContract",
    label: "Timeline Event Log",
    role: "Streaming and Replay Layer",
    detail: "The event contract and timeline log decouple frontend rendering from model and agent SDK internals.",
    points: [
      "Uses stable event types such as thinking_delta, text_delta, tool_call, and tool_result.",
      "Stamps sequence numbers and item keys so live frames and replayed frames share one identity space.",
      "Upserts completed transcript items while keeping in-flight delta frames live-only.",
    ],
    icon: Activity,
  },
];

const mainArchitectureNodeIds = ["operator", "workbench", "api", "runtime", "drivers", "agentGraph", "record"];
const executionLayerNodeIds = ["sandbox", "tools", "model"];
const foundationLayerNodeIds = ["notifications", "eventContract", "store"];

const agents = [
  {
    code: "cso",
    name: "Z3r0",
    role: "Chief Security Officer",
    capability: "Coordination",
    direction: "Red-team planning, delegation, and evidence synthesis",
    detail: "Task decomposition, specialist coordination, and result integration.",
    accent: "red",
    icon: Workflow,
  },
  {
    code: "cae",
    name: "V3ra",
    role: "Chief Audit Engineer",
    capability: "Code Audit",
    direction: "Source, dependency, and configuration review",
    detail: "Source code security audit, dependency review, and remediation verification.",
    accent: "cyan",
    icon: ClipboardCheck,
  },
  {
    code: "cie",
    name: "L1ly",
    role: "Chief Intelligence Engineer",
    capability: "Reconnaissance",
    direction: "Asset discovery, enrichment, and relationship mapping",
    detail: "Reconnaissance, asset discovery, and relationship analysis.",
    accent: "red",
    icon: FileSearch,
  },
  {
    code: "cpe",
    name: "Fr4nk",
    role: "Chief Penetration Engineer",
    capability: "Validation",
    direction: "Authorized exploitation validation and impact verification",
    detail: "Penetration testing, vulnerability validation, and impact verification.",
    accent: "cyan",
    icon: ShieldCheck,
  },
  {
    code: "cre",
    name: "J4m3",
    role: "Chief Reverse Engineer",
    capability: "Reverse",
    direction: "Sample, binary, firmware, and APK analysis",
    detail: "File, binary, firmware, and APK reverse engineering.",
    accent: "red",
    icon: Code2,
  },
  {
    code: "cce",
    name: "Nu1L",
    role: "Chief Cryptography Engineer",
    capability: "Cryptography",
    direction: "Protocol, key management, and implementation review",
    detail: "Cryptographic protocol review, key management, and implementation analysis.",
    accent: "cyan",
    icon: LockKeyhole,
  },
];

const runtimeSteps = [
  { title: "Start", text: "AgentSessionPool creates or resumes a red-team session and launches the owning instance driver.", icon: Layers3 },
  { title: "Drain", text: "run_until_idle executes the initial turn and every claimable PENDING notification for that instance.", icon: Activity },
  { title: "Dispatch", text: "Specialist agents and async sandbox commands register AWAITING obligations, then the driver stops while they run.", icon: Database },
  { title: "Terminal", text: "execute_async_command ends the current turn immediately, so agents cannot poll a running job.", icon: SquareTerminal },
  { title: "Resume", text: "Completed or failed background work flips the obligation to PENDING and wakes the owning instance.", icon: Zap },
  { title: "Replay", text: "Timeline events are stamped with seq values and item keys so refreshes read the same frames as live streams.", icon: FileSearch },
];

const evidenceFlow = [
  {
    title: "Authorized Scope",
    text: "Targets, owners, sandbox binding, and red-team objectives define the operating boundary before execution.",
    icon: Fingerprint,
  },
  {
    title: "Specialist Agents",
    text: "A coordinator delegates reconnaissance, validation, audit, reverse, and cryptography work to role-scoped experts.",
    icon: Workflow,
  },
  {
    title: "Sandboxed Tooling",
    text: "Commands, files, GUI tooling, skills, and manual review stay inside the selected Docker sandbox.",
    icon: SquareTerminal,
  },
  {
    title: "Evidence Records",
    text: "Assets, findings, relationship edges, and attack paths are stored as WorkProject-owned records.",
    icon: FileCheck2,
  },
  {
    title: "Replayable Review",
    text: "Timeline replay, graph views, and record tabs keep validation and handoff independent from model context.",
    icon: GitBranch,
  },
];

const highlights = [
  ["Async Instance Drivers", "Main and specialist drivers drain ready work, stop while background obligations run, and relaunch only when results are ready to integrate."],
  ["Notification-backed Liveness", "Subagent tasks and sandbox jobs register AWAITING obligations atomically, then wake owners through PENDING notifications."],
  ["Turn-terminal Commands", "Long sandbox commands end the current agent turn immediately, preventing polling loops and preserving a single resume path."],
  ["Interruptible Runtime", "The task runtime races SDK streams against notifications while deferring interruption until pending tool calls reach a safe point."],
  ["Session Agent Graph", "Roles, tools, knowledge, specialist agents, model settings, sandbox state, and WorkProject state are assembled per session."],
  ["Recoverable Delegation", "Specialist work can go dormant, resume after child work completes, cancel cleanly, and avoid hot relaunch loops."],
  ["Durable Timeline Replay", "Persisted UI events use stable seq values and item keys, so live streaming and replay share the same event contract."],
  ["WorkProject Evidence Records", "Project sessions persist scoped targets, discovered assets, findings, relationship edges, and attack paths as structured review data."],
  ["Scoped Context Projection", "Agents share persisted history while receiving role-appropriate context views that filter private tool traces."],
  ["Long-context Compaction", "Earlier projected history is summarized while recent context and durable facts remain available for continuation."],
  ["Generated Frontend Contracts", "Frontend types and enum constants are regenerated from backend schema instead of manually maintained in feature code."],
  ["Sandbox Tool Invalidation", "Sandbox state changes invalidate tool bindings and clean up active subagent work or async commands."],
];

const sandboxTools = ["Commands", "Skills", "Shell", "Files", "noVNC", "Ghidra", "jadx", "sqlmap", "nmap"];

export function LandingContent({ logoSrc, primaryAction }: LandingContentProps) {
  const [activeNode, setActiveNode] = useState(architectureNodes[3]);
  const ActiveArchitectureIcon = activeNode.icon;
  const mainArchitectureNodes = mainArchitectureNodeIds.map(getArchitectureNode);
  const executionLayerNodes = executionLayerNodeIds.map(getArchitectureNode);
  const foundationLayerNodes = foundationLayerNodeIds.map(getArchitectureNode);

  return (
    <main className="landing-page">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-scanline" aria-hidden="true" />

      <section id="top" className="landing-hero" aria-label="Z3r0 landing page">
        <div className="landing-hero-copy">
          <div className="landing-title-row">
            <img className="landing-hero-logo" src={logoSrc} width="1000" height="1000" alt="Z3r0 logo" />
            <div>
              <h1>AI-Native</h1>
              <h1>Red-Team Workbench</h1>
              <p>
                AI-native red-team workbench for authorized penetration testing and vulnerability
                research, with specialist agents, sandboxed tooling, evidence records, and replayable timelines.
              </p>
            </div>
          </div>
          <div className="landing-actions">
            <PrimaryActionLink action={primaryAction} />
            <a className="landing-action-link landing-action-secondary" href={repositoryUrl} target="_blank" rel="noopener noreferrer">
              <GitBranch size={17} />
              <span>Follow us</span>
            </a>
          </div>
        </div>

        <div className="landing-capability-matrix" aria-label="Z3r0 capability matrix">
          <div className="landing-capability-header">
            <span className="page-eyebrow">Red-Team Operating Model</span>
            <strong>Coordinator-led penetration testing and vulnerability research with specialist execution, durable evidence, and replayable review paths.</strong>
          </div>
          <div className="landing-capability-disclaimer">
            <div className="landing-boundary-heading">
              <AlertTriangle size={18} />
              <h3>Authorized use only</h3>
            </div>
            <p>
              Use this project only within a lawful and explicitly authorized scope. It does not grant
              permission to test, access, scan, or affect any third-party system, network, service, account,
              or data. Unauthorized, unlawful, or harmful use is prohibited. Users are responsible for
              preserving authorization, defining scope, and complying with applicable laws, contracts, and
              authorization boundaries. The author is not responsible for any consequence, loss, damage,
              legal liability, or unlawful act caused by users.
            </p>
          </div>
          <div className="landing-capability-grid">
            {agents.map((agent) => {
              const Icon = agent.icon;
              return (
                <article key={agent.code} className={`landing-capability-cell landing-capability-cell-${agent.accent}`}>
                  <div className="landing-capability-title">
                    <Icon size={20} />
                    <h3>{agent.capability}</h3>
                  </div>
                  <div className="landing-capability-identity">
                    <span>{agent.code}</span>
                    <strong>{agent.name}</strong>
                  </div>
                  <p>{agent.direction}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="architecture" className="landing-section landing-architecture" aria-labelledby="architecture-title">
        <div className="landing-section-heading">
          <span className="page-eyebrow">Architecture</span>
          <h2 id="architecture-title">Layered architecture for authorized red-team operations.</h2>
          <p>Z3r0 separates the workbench, API boundary, runtime orchestration, resumable drivers, session agent graph, sandboxed execution, model access, notification-backed liveness, timeline replay, and persisted WorkProject evidence records.</p>
        </div>

        <div className="landing-architecture-layout">
          <div className="landing-architecture-map" aria-label="Z3r0 layered architecture">
            <div className="landing-architecture-flow" aria-label="Primary request and review path">
              {mainArchitectureNodes.map((node) => (
                <ArchitectureGraphNode
                  key={node.id}
                  node={node}
                  activeId={activeNode.id}
                  className={`landing-arch-node-${node.id}`}
                  onSelect={setActiveNode}
                  emphasized={node.id === "runtime" || node.id === "agentGraph"}
                />
              ))}
            </div>

            <div className="landing-architecture-layer" aria-label="Execution and model layer">
              <div className="landing-layer-title">
                <span>Execution</span>
                <strong>Tools, sandboxes, and models are mounted behind runtime authorization.</strong>
              </div>
              <div className="landing-layer-grid landing-layer-grid-execution">
                {executionLayerNodes.map((node) => (
                  <ArchitectureGraphNode key={node.id} node={node} activeId={activeNode.id} onSelect={setActiveNode} compact />
                ))}
              </div>
            </div>

            <div className="landing-architecture-layer landing-architecture-layer-foundation" aria-label="Persistence and streaming layer">
              <div className="landing-layer-title">
                <span>Foundation</span>
                <strong>Notification obligations, stable events, and durable storage keep long red-team work recoverable.</strong>
              </div>
              <div className="landing-layer-grid landing-layer-grid-foundation">
                {foundationLayerNodes.map((node) => (
                  <ArchitectureGraphNode key={node.id} node={node} activeId={activeNode.id} onSelect={setActiveNode} compact />
                ))}
              </div>
            </div>
          </div>

          <aside className="landing-architecture-detail">
            <div className="landing-detail-heading">
              <div className="landing-detail-icon">
                <ActiveArchitectureIcon size={24} />
              </div>
              <div>
                <span className="page-eyebrow">Selected layer</span>
                <h3>{activeNode.label}</h3>
              </div>
            </div>
            <strong className="landing-detail-role">{activeNode.role}</strong>
            <p>{activeNode.detail}</p>
            <ul className="landing-detail-points">
              {activeNode.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section id="agents" className="landing-section" aria-labelledby="agents-title">
        <div className="landing-section-heading">
          <span className="page-eyebrow">Agent Team</span>
          <h2 id="agents-title">A lead security role coordinates specialists across the red-team lifecycle.</h2>
        </div>
        <div className="landing-agent-grid">
          {agents.map((agent) => (
            <article key={agent.code} className={`landing-agent-card landing-agent-card-${agent.accent}`}>
              <div>
                <span>{agent.code}</span>
                <strong>{agent.name}</strong>
              </div>
              <h3>{agent.role}</h3>
              <p>{agent.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="evidence" className="landing-section landing-evidence" aria-labelledby="evidence-title">
        <div className="landing-section-heading">
          <span className="page-eyebrow">Evidence Chain</span>
          <h2 id="evidence-title">Durable records keep findings reviewable after the model context changes.</h2>
          <p>Agent output is useful only when it can be traced to authorized scope, evidence, relationships, and review state. WorkProject records turn transient red-team analysis into structured data owned by the application.</p>
        </div>
        <div className="landing-evidence-flow" aria-label="Z3r0 evidence chain">
          {evidenceFlow.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="landing-evidence-step">
              <div className="landing-evidence-icon"><Icon size={18} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
              {index < evidenceFlow.length - 1 ? <ArrowRight className="landing-evidence-arrow" size={18} aria-hidden="true" /> : null}
            </article>
          ))}
        </div>
      </section>

      <section id="runtime" className="landing-section landing-runtime" aria-labelledby="runtime-title">
        <div className="landing-section-heading">
          <span className="page-eyebrow">Runtime Flow</span>
          <h2 id="runtime-title">Async drivers keep long red-team work resumable without polling or blocking on background work.</h2>
        </div>

        <div className="landing-runtime-track">
          {runtimeSteps.map(({ icon: Icon, title, text }, index) => (
            <article key={title} className="landing-runtime-step">
              <div className="landing-runtime-heading">
                <div className="landing-runtime-title">
                  <Icon size={18} />
                  <h3>{title}</h3>
                </div>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <p>{text}</p>
            </article>
          ))}
        </div>

        <div className="landing-sandbox-panel">
          <div>
            <span className="page-eyebrow">Sandbox Tooling</span>
            <h3>Agent tools and manual review share one controlled execution boundary.</h3>
            <p>Short commands return captured output metadata immediately. Long commands end the current agent turn and resume the owner only after terminal status, exit code, output size, and output file are available.</p>
          </div>
          <div className="landing-tool-cloud">
            {sandboxTools.map((tool) => <span key={tool}>{tool}</span>)}
          </div>
        </div>
      </section>

      <section className="landing-section landing-highlights" aria-labelledby="highlights-title">
        <div className="landing-section-heading">
          <span className="page-eyebrow">Technical Characteristics</span>
          <h2 id="highlights-title">Implementation boundaries that make agent-assisted red-team work recoverable, auditable, and contract-driven.</h2>
        </div>
        <div className="landing-highlight-grid">
          {highlights.map(([title, text], index) => (
            <article key={title} className="landing-highlight-card">
              <div className="landing-highlight-heading">
                {index % 2 === 0 ? <Zap size={18} /> : <CheckCircle2 size={18} />}
                <h3>{title}</h3>
              </div>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="security" className="landing-section landing-security" aria-labelledby="security-title">
        <div className="landing-section-heading">
          <span className="page-eyebrow">Operational Boundary</span>
          <h2 id="security-title">Built for authorized red-team work in controlled environments.</h2>
          <p>Use Z3r0 where sandbox execution, Docker access, file operations, and model credentials can be governed as high-privilege assets.</p>
        </div>
        <div className="landing-boundary">
          <div className="landing-boundary-heading">
            <LockKeyhole size={20} />
            <h3>Trusted deployment required</h3>
          </div>
          <p>
            Z3r0 is intended for authorized red-team operations, penetration testing,
            vulnerability research, security assessment, code auditing, internal review,
            controlled research, and training environments. Network access,
            sandbox containers, terminal access, file management, and model
            credentials should remain isolated and trusted. Users must define and
            follow an explicit authorization scope before using any tool capability.
          </p>
        </div>
      </section>
    </main>
  );
}

function PrimaryActionLink({ action }: { action: LandingPrimaryAction }) {
  if (action.href) {
    return (
      <a
        className="landing-action-link landing-action-primary"
        href={action.href}
        target={action.external ? "_blank" : undefined}
        rel={action.external ? "noopener noreferrer" : undefined}
      >
        <ShieldCheck size={17} />
        <span>{action.label}</span>
      </a>
    );
  }

  return (
    <button className="landing-action-link landing-action-primary" type="button" onClick={action.onSelect}>
      <ShieldCheck size={17} />
      <span>{action.label}</span>
    </button>
  );
}

function getArchitectureNode(id: string) {
  const node = architectureNodes.find((item) => item.id === id);
  if (!node) {
    throw new Error(`Missing architecture node: ${id}`);
  }
  return node;
}

function ArchitectureGraphNode({
  activeId,
  className = "",
  compact = false,
  emphasized = false,
  node,
  onSelect,
}: {
  activeId: string;
  className?: string;
  compact?: boolean;
  emphasized?: boolean;
  node: ArchitectureNode;
  onSelect: (node: ArchitectureNode) => void;
}) {
  const Icon = node.icon;
  const isActive = activeId === node.id;

  return (
    <button
      className={[
        "landing-arch-node",
        compact ? "landing-arch-node-compact" : "",
        emphasized ? "landing-arch-node-emphasized" : "",
        className,
        isActive ? "active" : "",
      ].filter(Boolean).join(" ")}
      type="button"
      onClick={() => onSelect(node)}
      onFocus={() => onSelect(node)}
      onMouseEnter={() => onSelect(node)}
    >
      <Icon size={compact ? 16 : 18} />
      <span>{node.label}</span>
      <em>{node.role}</em>
    </button>
  );
}
