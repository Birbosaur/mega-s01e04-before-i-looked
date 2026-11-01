import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

describe('digest routes', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  function setup() {
    tempDir = mkdtempSync(join(tmpdir(), 'rig-test-'));
    return { runsDir: tempDir };
  }

  describe('GET /digest/:night (HTML)', () => {
    it('200 with valid night showing multiple jobs, with retries, fail marked, and null owner as —', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      writeFileSync(
        join(runsDir, '2026-10-28.jsonl'),
        [
          '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
          '{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
          '{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
          '{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
          '{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
          '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
          '{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
        ].join('\n'),
      );

      const res = await createApp(config).request('/digest/2026-10-28');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('digest/render');
      expect(html).toContain('fixtures/refresh');
      expect(html).toContain('notes/backup');
      expect(html).toContain('rig/rotate-logs');

      // Verify retries >= 3 marked with class="warn"
      expect(html).toContain('<td>fixtures/refresh</td><td>rook</td><td>4</td><td class="warn">3</td>');

      // Verify fail marked with class="warn"
      expect(html).toContain('<td>notes/backup</td><td>lane-07</td><td>1</td><td>0</td><td class="warn">fail</td>');

      // Verify owner null shown as —
      expect(html).toContain('<td>digest/render</td><td>—</td>');
    });

    it('404 for a night with no file', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      const res = await createApp(config).request('/digest/2026-10-99');
      expect(res.status).toBe(404);
    });

    it('200 for an empty night file showing "nothing ran"', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      writeFileSync(join(runsDir, '2026-10-25.jsonl'), '');

      const res = await createApp(config).request('/digest/2026-10-25');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('nothing ran');
    });

    it('200 for a night with a bad JSONL line, rendering valid rows and warning about unparsed line', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      writeFileSync(
        join(runsDir, '2026-10-24.jsonl'),
        [
          '{"at":"2026-10-24T12:00:00+01:00","job":"job-one","status":"ok","owner":"alice"}',
          'this is not valid json',
          '{"at":"2026-10-24T12:01:00+01:00","job":"job-two","status":"fail","owner":"bob","error":"test"}',
        ].join('\n'),
      );

      const res = await createApp(config).request('/digest/2026-10-24');
      const html = await res.text();

      expect(res.status).toBe(200);
      expect(html).toContain('job-one');
      expect(html).toContain('job-two');
      expect(html).toMatch(/1 unparsed line|bad.*line|1 bad/i);
    });
  });

  describe('GET /api/digest/:night (JSON)', () => {
    it('200 returning same jobs in same order as HTML', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      writeFileSync(
        join(runsDir, '2026-10-28.jsonl'),
        [
          '{"at":"2026-10-28T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
          '{"at":"2026-10-29T01:30:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
          '{"at":"2026-10-29T01:31:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
          '{"at":"2026-10-29T01:33:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
          '{"at":"2026-10-29T01:37:00+01:00","job":"fixtures/refresh","status":"ok","owner":"rook"}',
          '{"at":"2026-10-29T04:00:01+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
          '{"at":"2026-10-29T05:41:09+01:00","job":"digest/render","status":"ok","owner":null}',
        ].join('\n'),
      );

      const res = await createApp(config).request('/api/digest/2026-10-28');
      expect(res.status).toBe(200);

      const json = (await res.json()) as unknown;
      expect(typeof json === 'object' && json !== null && 'rows' in json).toBe(true);

      const data = json as Record<string, unknown>;
      const rows = data.rows as Array<{ job: string }>;

      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.job)).toEqual([
        'digest/render',
        'fixtures/refresh',
        'notes/backup',
        'rig/rotate-logs',
      ]);
    });

    it('404 for a night with no file', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      const res = await createApp(config).request('/api/digest/2026-10-99');
      expect(res.status).toBe(404);
    });

    it('200 for an empty night file returning rows: []', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      writeFileSync(join(runsDir, '2026-10-25.jsonl'), '');

      const res = await createApp(config).request('/api/digest/2026-10-25');
      const json = (await res.json()) as unknown;

      expect(res.status).toBe(200);
      expect(typeof json === 'object' && json !== null && 'rows' in json).toBe(true);

      const data = json as Record<string, unknown>;
      expect(data.rows).toEqual([]);
    });

    it('200 for a night with bad JSONL reporting badLines: 1', async () => {
      const { runsDir } = setup();
      const config = {
        adapter: 'shim' as const,
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      };

      writeFileSync(
        join(runsDir, '2026-10-24.jsonl'),
        [
          '{"at":"2026-10-24T12:00:00+01:00","job":"job-one","status":"ok","owner":"alice"}',
          'this is not valid json',
          '{"at":"2026-10-24T12:01:00+01:00","job":"job-two","status":"fail","owner":"bob","error":"test"}',
        ].join('\n'),
      );

      const res = await createApp(config).request('/api/digest/2026-10-24');
      const json = (await res.json()) as unknown;

      expect(res.status).toBe(200);
      expect(typeof json === 'object' && json !== null && 'badLines' in json).toBe(true);

      const data = json as Record<string, unknown>;
      expect(data.badLines).toBe(1);
      expect(Array.isArray(data.rows)).toBe(true);
      expect((data.rows as unknown[]).length).toBe(2);
    });
  });
});
