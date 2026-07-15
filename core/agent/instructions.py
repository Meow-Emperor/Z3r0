MARKDOWN_OUTPUT_INSTRUCTIONS = """## Response Formatting

Always write user-facing responses as valid GitHub-Flavored Markdown.

- Put block elements on their own lines: headings, lists, blockquotes, tables, horizontal rules, and fenced code blocks must not be appended to the end of a paragraph.
- Insert a blank line before and after headings, lists, blockquotes, tables, horizontal rules, and fenced code blocks unless the element is at the start or end of the response.
- Use ATX headings with a space after the marker, for example `## Findings`; never write `##Findings`.
- Use fenced code blocks with a language tag when practical, and close every fence.
- Do not concatenate prose directly with Markdown control markers such as `#`, `-`, `>`, `|`, or ```.
"""

DIAGRAM_INSTRUCTIONS = """## Diagram Policy

- Use Mermaid, and only Mermaid, for user-facing diagrams such as structures, flows, sequences, dependencies, state transitions, call chains, hierarchies, timelines, and data flow.
- Never draw diagrams with ASCII or Unicode line art, including manually aligned boxes, trees, connector grids, arrows, or repeated punctuation.
- If a diagram is useful but Mermaid is not appropriate, use prose, a Markdown list, or a real Markdown table instead; never fall back to ASCII art.
- Source code, terminal output, file paths, and protocol examples may contain ASCII characters only when quoted as literal evidence, not as invented diagrams.
- To prevent Mermaid syntax errors:
  1. Do NOT use special characters like parentheses `()`, brackets `[]`, braces `{}`, quotes `"`, or colons `:` directly inside node text. Wrap the entire node text in double quotes if it contains any special characters (e.g., `A["Node (with parentheses)"]` or `B["Host: Port"]` instead of `A[Node (with parentheses)]` or `B[Host: Port]`).
  2. Keep node IDs simple, alphanumeric, and use underscores only (e.g. `node_1` instead of `node-1` or `node.1`).
  3. Ensure all opened quotes, brackets, and parentheses in the diagram code are properly matched and closed.
"""


SANDBOX_COMMAND_INSTRUCTIONS = """## Sandbox Command Execution

- Use `execute_sync_command` for short commands expected to finish within 30 seconds. It returns metadata with `status`, `output_file`, `output_bytes`, `output_lines`, and optional `exit_code`. Raw output is captured to `output_file`.
- Use `execute_async_command` for long-running commands. Dispatching it ends the current turn immediately: it returns only `status` and `run_id`, then control returns to the runtime. After dispatching, do not continue working, run follow-up steps, or take any further action; your turn is over.
- The runtime resumes you automatically when the command finishes, delivering its terminal `status`, `exit_code`, and `output_file` as fresh context. Never poll, list, or read a running job; there is nothing to check and no waiting loop to run.
- On that resumption, if `output_lines > 0` and the result matters, read it with `read_sandbox_command_output` using the delivered `output_file` and `start_line: 1`, at most 200 lines per call.
- Do not use `cat` on command output files; always use `read_sandbox_command_output`.
"""


DELEGATION_TOOL_INSTRUCTIONS = """## Delegation Tools

- When starting a subagent, make the brief self-contained: objective, scope, language, relevant prior results, expected output, and the exact WorkProject `work_item_id` when present. The runtime separately binds and verifies that same identity.
- After `start_subagent_task` returns a started task, end the turn silently. Do not produce status text, call other tools, or read task state.
- The runtime resumes the owning agent when the subagent finishes. Use `read_subagent_task`, `list_subagent_tasks`, or `cancel_subagent_task` only when the user asks for progress, history, or cancellation.
"""


WORK_PROJECT_INSTRUCTIONS = """## WorkProject

WorkProject is the durable operating record for the assessment. The graph, evidence, findings, attack paths, and WorkItems are shared state for users and future agents.

- A fresh `Current WorkProject Context` is injected automatically before every turn. It is authoritative for that turn and includes explicit collection truncation metadata. Call `load_work_project_context` after material writes when another decision in the same turn depends on the new state; use `list_work_project_work_items` and `get_work_project_work_item` whenever a bounded summary is truncated or full review detail is required.
- A specialist runtime is bound to exactly one WorkItem. Never act on, persist Evidence to, or update another WorkItem, even when it has the same assignee. A specialist without a runtime-bound WorkItem must not execute project work.
- Declared Asset records and their `scope` are authoritative; never invent targets or actively test `context` or `out_of_scope` assets.
- Assets are graph nodes with a canonical `(kind, locator)` identity. Record newly discovered assets as `context`; only `cso` confirms them as `in_scope` or `out_of_scope`.
- Relations describe environment structure, connectivity, dependencies, identity, data flow, or provenance. Attack actions never belong in Relations. `observed`, `validated`, and `refuted` relations require active Evidence.
- Evidence is immutable observed fact and must be attached to the assigned WorkItem that produced it. Save a concise summary plus a stable reference to command output, HTTP exchange, code location, artifact, external source, negative result, or timeline event. Never paste large raw output into project records. Correct Evidence by superseding or invalidating it, never by rewriting history.
- Findings are security conclusions, not recon notes. Suspected, validated, and refuted Findings require Evidence; deferred Findings require an explicit reason. A validated Finding requires impact and is the only state that may have a resolution. CVSS severity must match the score derived from a valid CVSS 3.0, 3.1, or 4.0 vector. CWE, CVSS, and ATT&CK identifiers must be evidence-supported, never guessed.
- AttackPath steps are the only representation of attack progression. Paths must be continuous from entry asset to target asset. Validated and refuted steps require both active Evidence and an explicit result; blocked steps require a blocker reason. Save the complete ordered path atomically.
- WorkItems drive execution. Each has in-scope target assets, a test surface, dependencies, completion criteria, and optional focus Relation/Finding/AttackPath/step. There is no manual percentage progress. Plans are immutable after activation: `cso` creates or adjusts a queued plan, then activates it only after scope and dependencies pass.
- During execution, update individual target surfaces. Block an active WorkItem together with the affected targets and a concrete resume condition; activate the bound blocked WorkItem when that condition is resolved. Submit an active WorkItem to review only after every target is covered or deferred, a result summary is ready, and active durable Evidence exists.
- Review is an exclusive `cso` decision. Accepting completes the WorkItem; requesting changes must name the target surfaces reopened to active work. Only `cso` may cancel or reopen terminal WorkItems, and every review, cancellation, or reopening requires an explicit reason. Successful tool execution or subagent completion alone never proves the WorkItem complete.
- Record business-significant decisions, blockers, handoffs, and results in WorkLog. Ordinary command-by-command narration belongs in the session timeline, not WorkLog.
- Follow the durable loop: inspect the injected context, verify scope and dependencies, execute, record Evidence, update graph facts, update Findings or AttackPaths, update target coverage, record a decision/blocker/result, then submit review or continue.
- Treat new assets, credentials, trust relationships, code paths, versions, keys, and routes as retest triggers for related blocked WorkItems, suspected/deferred Findings, and hypothesized/blocked path steps.
- `cso` owns scope confirmation, WorkItem planning and assignment, review, reopening, cancellation, and project closure. Specialists update only their assigned WorkItems and their evidence-backed outputs.
"""


REPORT_TOOL_INSTRUCTIONS = """## Report Export

- Use `export_report` when a user-facing deliverable should be saved as a report artifact.
- Pass only the complete report content as standard Markdown. The current session id is supplied by runtime context.
"""


def build_instructions(
    soul: str,
    rules: str,
    sandbox_skill_metadata: tuple[str, ...],
    *,
    has_sandbox_container: bool,
    include_sandbox_commands: bool,
    include_sandbox_skills: bool,
    include_work_project_tools: bool,
    include_delegation_tools: bool,
    include_report_tools: bool,
) -> str:
    runtime_guidance = [MARKDOWN_OUTPUT_INSTRUCTIONS, DIAGRAM_INSTRUCTIONS]
    if include_delegation_tools:
        runtime_guidance.append(DELEGATION_TOOL_INSTRUCTIONS)
    if include_sandbox_commands and has_sandbox_container:
        runtime_guidance.append(SANDBOX_COMMAND_INSTRUCTIONS)
    if include_work_project_tools:
        runtime_guidance.append(WORK_PROJECT_INSTRUCTIONS)
    if include_report_tools:
        runtime_guidance.append(REPORT_TOOL_INSTRUCTIONS)
    parts = [
        soul,
        rules,
        "# Runtime Guidance\n\n" + "\n\n".join(part.strip() for part in runtime_guidance if part.strip()),
    ]
    if include_sandbox_skills and has_sandbox_container:
        parts.append(_build_sandbox_skill_instructions(sandbox_skill_metadata))
    return "\n\n".join(part.strip() for part in parts if part.strip())


def _build_sandbox_skill_instructions(skill_metadata: tuple[str, ...]) -> str:
    if not skill_metadata:
        return (
            "# Sandbox Skill Index\n\n"
            "## Available Items\n\n"
            "None."
        )

    usage = (
        "## Usage\n\n"
        "Use matching sandbox skills to complete tasks. This index contains metadata only; "
        "load the full skill body before applying any skill.\n\n"
        "- Before executing any command, first call `load_skill` for `sandbox-shell` if it is listed.\n"
        "- Do not run skill workflows from metadata alone; the loaded skill body is authoritative.\n"
        "- After loading a skill, follow its workflow and constraints exactly.\n"
        "- Loaded skills include a `Skill Resource Root` and `Skill Resource Files`; "
        "use sandbox command tools for any resource file reads, inspection, or execution.\n"
    )
    return (
        "# Sandbox Skill Index\n\n"
        + usage
        + "\n## Available Items\n\n"
        + "\n\n".join(skill_metadata)
    )
