import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

const GOOD_LINE = '{"at":"2026-01-01T02:00:00+01:00","job":"alpha/job","status":"ok","owner":"rook"}';
const OTHER_LINE = '{"at":"2026-01-01T03:00:00+01:00","job":"beta/job","status":"fail","owner":"rook","error":"boom"}';

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  for (const [night, content] of Object.entries(files)) writeFileSync(join(dir, `${night}.jsonl`), content);
  return dir;
}

function appFor(runsDir: string) {
  return createApp({ ...base, runsDir });
}

beforeEach(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
});

describe('GET /digest/:night', () => {
  it('answers 200 with the jobs of runs/2026-10-28', async () => {
    const res = await appFor('runs').request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest · 2026-10-28');
    expect(html).toContain('fixtures/refresh');
    expect(html).toContain('notes/backup');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await appFor(tempRuns({})).request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('answers 200 with "nothing ran" and no rows for an empty night', async () => {
    const dir = tempRuns({ '2026-01-01': '' });
    const res = await appFor(dir).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<tr class');
    expect(html).not.toContain('<td');
  });

  it('still renders the good rows when the night has a bad line', async () => {
    const dir = tempRuns({ '2026-01-01': `${GOOD_LINE}\nnot json at all\n${OTHER_LINE}\n` });
    const res = await appFor(dir).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/job');
    expect(html).toContain('beta/job');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 with the whole DigestNight for runs/2026-10-28', async () => {
    const res = await appFor('runs').request('/api/digest/2026-10-28');
    const body = (await res.json()) as DigestNight;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.length).toBe(5);
    expect(body.badLines).toBe(1);
    expect(body.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('answers 404 with {"error":"not found"} for a night with no file', async () => {
    const res = await appFor(tempRuns({})).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('answers 200 with rows: [] for an empty night', async () => {
    const dir = tempRuns({ '2026-01-01': '' });
    const res = await appFor(dir).request('/api/digest/2026-01-01');
    const body = (await res.json()) as DigestNight;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
  });

  it('counts the bad line and keeps the good rows', async () => {
    const dir = tempRuns({ '2026-01-01': `${GOOD_LINE}\nnot json at all\n${OTHER_LINE}\n` });
    const res = await appFor(dir).request('/api/digest/2026-01-01');
    const body = (await res.json()) as DigestNight;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'beta/job']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for 2026-10-28', async () => {
    const app = appFor('runs');
    const api = (await (await app.request('/api/digest/2026-10-28')).json()) as DigestNight;
    const html = await (await app.request('/digest/2026-10-28')).text();
    const jobs = api.rows.map((r) => r.job);
    expect(jobs.length).toBe(5);
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
