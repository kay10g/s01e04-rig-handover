// The digest contract (plan.md § 1, issue #1). #2 implements `readNight`; #3–#6 build against
// these types only.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One parsed line of `runs/<night>.jsonl`. */
export type RunLine = {
  at: string; // ISO 8601 with the log's offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for a night. */
export type DigestRow = {
  job: string;
  owner: string | null; // null is kept; views show `—`
  runs: number; // every parsed line for this job
  retries: number; // this job's `retry` lines
  lastStatus: RunStatus;
  lastError: string | null; // `error` of the job's last line, null when it has none
  firstAt: string;
  lastAt: string;
};

/** A night read from disk. Also the body of `GET /api/digest/:night`. */
export type DigestNight = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that don't parse, per night, not per job
  counts: Record<RunStatus, number>; // parsed lines by status (#5)
};

/**
 * Reads `<runsDir>/<night>.jsonl`. Returns `null` when there is no such file or `night` is not
 * YYYY-MM-DD (routes answer 404). An empty file gives `rows: []`. Never throws on a bad line.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
