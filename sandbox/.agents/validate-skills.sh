#!/bin/sh
set -eu

skills_dir="${1:-.agents/skills}"

fail() {
  echo "validate-skills: $*" >&2
  exit 1
}

[ -d "$skills_dir" ] || fail "skills directory not found: $skills_dir"

skill_files=$(find "$skills_dir" -mindepth 2 -maxdepth 2 -name SKILL.md -type f | sort)
[ -n "$skill_files" ] || fail "no SKILL.md files found under $skills_dir"

echo "$skill_files" | while IFS= read -r skill_file; do
  skill_dir=$(dirname "$skill_file")
  skill_name=$(basename "$skill_dir")

  first_line=$(sed -n '1p' "$skill_file")
  [ "$first_line" = "---" ] || fail "$skill_file: missing YAML front matter"

  end_line=$(awk 'NR > 1 && $0 == "---" { print NR; exit }' "$skill_file")
  [ -n "$end_line" ] || fail "$skill_file: unterminated YAML front matter"

  declared_name=$(awk -F': *' 'NR > 1 && $1 == "name" { print $2; exit }' "$skill_file")
  [ -n "$declared_name" ] || fail "$skill_file: missing front matter name"
  [ "$declared_name" = "$skill_name" ] || fail "$skill_file: name '$declared_name' does not match directory '$skill_name'"

  description=$(awk -F': *' 'NR > 1 && $1 == "description" { print $2; exit }' "$skill_file")
  [ -n "$description" ] || fail "$skill_file: missing front matter description"
  [ "${#description}" -le 320 ] || fail "$skill_file: description is too long"

  h1=$(awk 'sub(/^# /, "") { print; exit }' "$skill_file")
  [ -n "$h1" ] || fail "$skill_file: missing H1 title"
  [ "$h1" = "$skill_name" ] || fail "$skill_file: H1 '$h1' does not match skill name '$skill_name'"
done

echo "validate-skills: ok"
