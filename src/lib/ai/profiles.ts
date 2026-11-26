/**
 * Utilities for parsing and formatting OMB-style custom ACP profile args and environment maps.
 */

export function parseArgsString(raw: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const token = match[1] ?? match[2] ?? match[3] ?? "";
    if (token.length > 0) {
      args.push(token);
    }
  }
  return args;
}

export function formatArgsString(args: string[]): string {
  return args
    .map((arg) => {
      if (/\s/.test(arg) && !/^".*"$/.test(arg) && !/^'.*'$/.test(arg)) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    })
    .join(" ");
}

export function parseEnvText(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function formatEnvText(env: Record<string, string> | undefined): string {
  if (!env) return "";
  return Object.entries(env)
    .filter(([k]) => k.trim().length > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
