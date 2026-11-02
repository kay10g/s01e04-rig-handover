import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function nightWith(content: string, night = '2026-01-01') {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, `${night}.jsonl`), content);
  return { dir, night };
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const result = readNight('runs', '2026-10-28');

  it('gives 5 jobs and 1 bad line', () => {
    expect(result?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(result?.badLines).toBe(1);
  });

  it('counts runs and retries per job', () => {
    const by = Object.fromEntries((result?.rows ?? []).map((r) => [r.job, r]));
    expect(by['fixtures/refresh']).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(by['lane/sync']).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held' });
    expect(by['notes/backup']).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps the null owner and the log offset', () => {
    const by = Object.fromEntries((result?.rows ?? []).map((r) => [r.job, r]));
    expect(by['digest/render']?.owner).toBeNull();
    expect(by['fixtures/refresh']).toMatchObject({
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('counts parsed lines by status', () => {
    expect(result?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2099-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../package')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('renders an empty file as no rows', () => {
    const { dir, night } = nightWith('');
    expect(readNight(dir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts bad lines instead of throwing, whatever is wrong with them', () => {
    const good = '{"at":"2026-01-01T00:00:00+01:00","job":"a","status":"ok","owner":"x"}';
    const { dir, night } = nightWith(
      [good, 'not json', '[1]', '{"job":"a"}', '{"at":"t","job":"a","status":"weird","owner":"x"}', '{"at":"t","job":"a","status":"ok","owner":5}', '{"at":"t"'].join('\n') + '\n',
    );
    const r = readNight(dir, night);
    expect(r?.badLines).toBe(6);
    expect(r?.rows).toHaveLength(1);
    expect(r?.rows[0]?.runs).toBe(1);
  });

  it('keeps the most recent error after a later line succeeds, and null when a job never had one', () => {
    const { dir, night } = nightWith(
      '{"at":"t1","job":"a","status":"retry","owner":"x","error":"first"}\n{"at":"t2","job":"a","status":"retry","owner":"x","error":"second"}\n{"at":"t3","job":"a","status":"ok","owner":"x"}\n{"at":"t4","job":"b","status":"ok","owner":"x"}\n',
    );
    const by = Object.fromEntries((readNight(dir, night)?.rows ?? []).map((r) => [r.job, r]));
    expect(by.a).toMatchObject({ lastStatus: 'ok', lastError: 'second' });
    expect(by.b?.lastError).toBeNull();
  });

  it('keeps a row whose owner is null or missing', () => {
    const { dir, night } = nightWith(
      '{"at":"t1","job":"a","status":"ok","owner":null}\n{"at":"t2","job":"b","status":"ok"}\n',
    );
    expect(readNight(dir, night)?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', null],
    ]);
  });
});
