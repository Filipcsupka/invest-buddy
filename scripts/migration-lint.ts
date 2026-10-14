import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface LintFile { name: string; content: string }
export interface LintIssue { file: string; line: number | null; rule: string; message: string }

const NAME = /^(\d{3})_[a-z0-9_]+\.sql$/;
const ALLOW = /--\s*lint:allow(?:\s+(\S.*))?$/;

const RULES: Array<{ rule: string; pattern: RegExp; message: string; allowable: boolean }> = [
  { rule: "drop-table", pattern: /\bDROP\s+TABLE\b/i, message: "DROP TABLE is not allowed", allowable: true },
  { rule: "drop-column", pattern: /\bDROP\s+COLUMN\b/i, message: "DROP COLUMN is not allowed", allowable: true },
  { rule: "truncate", pattern: /^\s*TRUNCATE\b/i, message: "TRUNCATE is not allowed", allowable: true },
  { rule: "alter-column-type", pattern: /\bALTER\s+COLUMN\b[^;]*?\bTYPE\b/is, message: "ALTER COLUMN ... TYPE rewrites the table and is not allowed", allowable: true },
  { rule: "index-concurrently", pattern: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i, message: "CREATE INDEX CONCURRENTLY cannot run in the migration transaction", allowable: false },
  { rule: "index-if-not-exists", pattern: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)(?!IF\s+NOT\s+EXISTS\b)/i, message: "CREATE INDEX needs IF NOT EXISTS", allowable: true },
];

interface Statement { text: string; startLine: number; endLine: number; allow: string | null; allowEmpty: boolean }

/** Splits SQL into statements on `;`, dropping comments and remembering `-- lint:allow <reason>` comments. */
function statements(sql: string): Statement[] {
  const result: Statement[] = [];
  let current: Statement | null = null;
  let pendingAllow: { reason: string | null; empty: boolean } | null = null;
  sql.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const commentAt = raw.indexOf("--");
    const code = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
    const allowMatch = commentAt >= 0 ? ALLOW.exec(raw.slice(commentAt).trim()) : null;
    const allow = allowMatch ? { reason: allowMatch[1]?.trim() || null, empty: !allowMatch[1]?.trim() } : null;
    if (!code.trim()) {
      if (allow) pendingAllow = allow;
      else if (commentAt < 0) pendingAllow = null;
      return;
    }
    if (!current) {
      current = { text: "", startLine: line, endLine: line, allow: pendingAllow?.reason ?? null, allowEmpty: pendingAllow?.empty ?? false };
      pendingAllow = null;
    }
    if (allow) { current.allow = allow.reason; current.allowEmpty = allow.empty; }
    current.text += `${code}\n`;
    current.endLine = line;
    if (code.includes(";")) { result.push(current); current = null; }
  });
  if (current) result.push(current);
  return result;
}

/**
 * Checks migration files. `added` are the files to lint; `baseNames` are the migration names already on the base branch.
 * Numbers must be unique and above the highest base number. Gaps are allowed: lanes reserve number ranges.
 */
export function lintMigrations(added: LintFile[], baseNames: string[] = []): LintIssue[] {
  const issues: LintIssue[] = [];
  const baseNumbers = baseNames.map((name) => NAME.exec(name)?.[1]).filter((n): n is string => !!n).map(Number);
  const maxBase = baseNumbers.length ? Math.max(...baseNumbers) : 0;
  const seen = new Map<string, string>(baseNames.flatMap((name) => { const n = NAME.exec(name)?.[1]; return n ? [[n, name] as [string, string]] : []; }));
  for (const file of [...added].sort((a, b) => a.name.localeCompare(b.name))) {
    const match = NAME.exec(file.name);
    if (!match) {
      issues.push({ file: file.name, line: null, rule: "name", message: "name must match NNN_snake_case.sql" });
    } else {
      const other = seen.get(match[1]);
      if (other && other !== file.name) issues.push({ file: file.name, line: null, rule: "duplicate-number", message: `number ${match[1]} is already used by ${other}` });
      else if (other === file.name && !baseNames.includes(file.name)) issues.push({ file: file.name, line: null, rule: "duplicate-number", message: `number ${match[1]} is used twice` });
      else if (!baseNames.includes(file.name) && Number(match[1]) <= maxBase && !/^--\s*lint:allow-order\s+\S/m.test(file.content)) {
        issues.push({ file: file.name, line: null, rule: "number-order", message: `number ${match[1]} is not above the highest number on the base branch (${String(maxBase).padStart(3, "0")}); add "-- lint:allow-order <reason>" if intended` });
      }
      seen.set(match[1], file.name);
    }
    for (const statement of statements(file.content)) {
      for (const rule of RULES) {
        if (!rule.pattern.test(statement.text)) continue;
        if (rule.allowable && statement.allow) continue;
        const message = rule.allowable && statement.allowEmpty ? `${rule.message}; lint:allow needs a reason` : rule.allowable ? `${rule.message}; add "-- lint:allow <reason>" if intended` : rule.message;
        issues.push({ file: file.name, line: statement.startLine, rule: rule.rule, message });
      }
    }
  }
  return issues;
}

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main(argv: string[]) {
  const dir = join(process.cwd(), "migrations");
  const all = argv.includes("--all");
  const baseArg = argv.find((a) => a.startsWith("--base="))?.slice("--base=".length) ?? "origin/main";
  const names = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
  let added: string[];
  let baseNames: string[] = [];
  if (all) {
    added = names;
  } else {
    baseNames = git(["ls-tree", "--name-only", baseArg, "migrations/"]).split("\n").filter(Boolean).map((p) => p.replace(/^migrations\//, ""));
    added = names.filter((n) => !baseNames.includes(n));
  }
  const issues = lintMigrations(added.map((name) => ({ name, content: readFileSync(join(dir, name), "utf8") })), baseNames);
  for (const i of issues) process.stderr.write(`migrations/${i.file}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}\n`);
  process.stdout.write(`migration-lint: ${added.length} file(s) checked, ${issues.length} problem(s)\n`);
  if (issues.length) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("migration-lint.ts")) main(process.argv.slice(2));
