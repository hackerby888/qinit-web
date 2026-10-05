// Workspace-wide search: scan every file's in-memory source for a query (plain substring or regex,
// case-sensitive optional) and return per-file line/column matches with a preview. Pure → unit-tested; the
// SearchPanel renders the results and jumps to them.
export interface SearchMatch {
  line: number; // 1-based
  col: number;  // 1-based
  preview: string;
}

export interface FileResult {
  name: string;
  matches: SearchMatch[];
}

export interface SearchOpts {
  caseSensitive?: boolean;
  regex?: boolean;
}

const MAX_PER_FILE = 500;

function buildRegex(query: string, opts: SearchOpts): RegExp | null {
  try {
    const pattern = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(pattern, opts.caseSensitive ? "g" : "gi");
  } catch {
    return null; // invalid regex — caller shows nothing
  }
}

// Why a regex query cannot run, or null when it can: an invalid pattern once just kept the previous count on screen.
export function searchError(query: string, opts: SearchOpts = {}): string | null {
  if (!query || !opts.regex) {
    return null;
  }
  try {
    new RegExp(query);
    return null;
  } catch (error) {
    return `invalid pattern — ${(error as Error).message}`;
  }
}

export function searchWorkspace(files: { name: string; source: string }[], query: string, opts: SearchOpts = {}): FileResult[] {
  if (!query) {
    return [];
  }

  const re = buildRegex(query, opts);
  if (!re) {
    return [];
  }

  const results: FileResult[] = [];

  for (const f of files) {
    const matches: SearchMatch[] = [];
    const lines = f.source.split("\n");

    for (let i = 0; i < lines.length && matches.length < MAX_PER_FILE; i++) {
      const line = lines[i];
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        matches.push({ line: i + 1, col: m.index + 1, preview: line.trim().slice(0, 200) });
        if (m.index === re.lastIndex) {
          re.lastIndex++; // guard against zero-width matches looping forever
        }
        if (matches.length >= MAX_PER_FILE) {
          break;
        }
      }
    }

    if (matches.length > 0) {
      results.push({ name: f.name, matches });
    }
  }

  return results;
}
