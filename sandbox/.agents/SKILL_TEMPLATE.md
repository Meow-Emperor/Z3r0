---
name: example-skill
description: Use this skill for one clear sandbox task family. Keep this sentence short, specific, and action-oriented.
---

# Example Skill

Describe the task scope, when to use the skill, and any authorization boundary that matters.

## Help First

Use this section for direct CLI skills whose installed help output should be the source of truth.
For resource-only skills, use `## Resource Paths` instead. For controller skills with special startup behavior, use `## Core Rules` instead.

```sh
tool --help
```

## Resource Paths

Use this section when the skill ships files under its skill root. `load_skill` lists shipped resource files automatically; reference files with `.agents/skills/<skill-name>/...` paths when commands need them.

- Wrapper script: `.agents/skills/example-skill/scripts/example-skill.sh`
- Supporting files: `.agents/skills/example-skill/scripts/support`

## Usage Rules

Use this section for scope boundaries, preinstalled-tool expectations, safety limits, and how the tool should relate to nearby skills.

```sh
.agents/skills/example-skill/scripts/example-skill.sh [options] <input>
```

## Common Workflows

Provide bounded examples that match the sandbox command model.

```sh
tool --help
.agents/skills/example-skill/scripts/example-skill.sh --help
```

## Output

Describe what to report: command used, scope, relevant findings, output paths, and failures that affect completion.

## Validation Notes

Every skill must use:

- Front matter `name` matching the directory name.
- An H1 matching the directory name exactly.
- A `description` beginning with `Use` and ending with a period.
- One of `## Help First`, `## Resource Paths`, `## Core Rules`, or `## Tool Contract`.
- One of `## Usage Rules` or `## Core Rules`.
- One of `## Common Workflows`, `## Command Selection`, `## Wordlist Selection`, `## Quick Reference`, or `## Choosing Execution`.
- `## Output`.

Prefer preinstalled sandbox tools. Do not tell agents to install, upgrade, reinstall, or replace an available tool. Use `uv` only for missing Python dependencies, task-scoped virtual environments, or non-preinstalled Python tools required by the task.
