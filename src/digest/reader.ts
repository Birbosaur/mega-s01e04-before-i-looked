import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightCounts, NightDigest, RunStatus } from './types.js';

type LogEntry = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function parseLine(line: string): LogEntry | null {
  try {
    const raw: unknown = JSON.parse(line);
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.at !== 'string' || typeof obj.job !== 'string') return null;
    if (obj.status !== 'ok' && obj.status !== 'retry' && obj.status !== 'fail') return null;
    if (obj.owner !== null && typeof obj.owner !== 'string') return null;
    if (obj.error !== undefined && typeof obj.error !== 'string') return null;
    return {
      at: obj.at,
      job: obj.job,
      status: obj.status,
      owner: obj.owner,
      ...(typeof obj.error === 'string' ? { error: obj.error } : {}),
    };
  } catch {
    return null;
  }
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let content: string;
  try {
    content = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }

  const byJob = new Map<string, DigestRow>();
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry) {
      badLines += 1;
      continue;
    }
    counts[entry.status] += 1;
    const existing = byJob.get(entry.job);
    if (!existing) {
      byJob.set(entry.job, {
        job: entry.job,
        owner: entry.owner,
        runs: 1,
        retries: entry.status === 'retry' ? 1 : 0,
        lastStatus: entry.status,
        lastError: entry.error ?? null,
        firstAt: entry.at,
        lastAt: entry.at,
      });
    } else {
      if (entry.owner !== null) existing.owner = entry.owner;
      existing.runs += 1;
      if (entry.status === 'retry') existing.retries += 1;
      existing.lastStatus = entry.status;
      if (entry.error !== undefined) existing.lastError = entry.error;
      existing.lastAt = entry.at;
    }
  }

  const rows = [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job));
  return { night, rows, badLines, counts };
}
