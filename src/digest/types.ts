export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type NightDigest = {
  night: string;
  rows: DigestRow[];
  badLines: number;
  counts: NightCounts;
};

export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
