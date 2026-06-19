export interface Asset { name: string; os: string; arch: string; url: string; size: number; downloads: number }
export interface Release {
  version: string; publishedAt: string; installCmd: string;
  assets: Asset[]; totalDownloads: number;
}

export async function fetchRelease(): Promise<Release> {
  const r = await fetch("/api/release/latest");
  if (!r.ok) throw new Error(`release fetch failed (${r.status})`);
  return r.json();
}

export async function fetchStats(): Promise<{ visits: number }> {
  const r = await fetch("/api/stats");
  if (!r.ok) return { visits: 0 };
  return r.json();
}
