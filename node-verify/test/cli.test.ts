// The two commands the Live job runs, and the exit codes it reads.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const PLEDGE = `pledges/6b16764e210c766086f5dc0be7dca2727a56ddc6c92a6377e5c01b1653e5910e.pledge`;
const root = fileURLToPath(new URL('..', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'pledge-cli-'));
after(() => rmSync(tmp, { recursive: true, force: true }));

function run(script: string, ...args: string[]): { code: number | null; out: Record<string, any> } {
    const r = spawnSync(process.execPath, ['--import', 'tsx', `src/${script}`, ...args], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : {} };
}

function file(name: string, text: string): string {
    const p = join(tmp, name);
    writeFileSync(p, text);
    return p;
}

function tampered(): string {
    const env = JSON.parse(readFileSync(join(root, PLEDGE), 'utf8'));
    const bytes = Buffer.from(env.sig.value, 'base64');
    bytes[10]! ^= 0x01;
    env.sig.value = bytes.toString('base64');
    return file('tampered.pledge', JSON.stringify(env));
}

test('verify: the committed pledge exits 0', () => {
    const r = run('verify-cli.ts', PLEDGE);
    assert.equal(r.code, 0);
    assert.equal(r.out.ok, true);
    assert.equal(r.out.swearer, 'bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw');
});

test('verify: a tampered pledge exits 2', () => {
    const r = run('verify-cli.ts', tampered());
    assert.equal(r.code, 2);
    assert.equal(r.out.code, 'E_PLEDGE_BAD_SIG');
});

test('verify: text that is not a pledge exits 1', () => {
    assert.equal(run('verify-cli.ts', file('junk.pledge', 'not json')).code, 1);
    assert.equal(run('verify-cli.ts', join(tmp, 'missing.pledge')).code, 1);
});

test('state --check: the committed states exit 0', () => {
    const r = run('state-cli.ts', PLEDGE, '--headers', 'headers', '--check', 'states.json');
    assert.equal(r.code, 0);
    assert.equal(r.out.results.length, 3);
});

test('state --check: one wrong expected state exits 2', () => {
    const states = JSON.parse(readFileSync(join(root, 'states.json'), 'utf8'));
    states[1].state = 'pending';
    const r = run('state-cli.ts', PLEDGE, '--headers', 'headers', '--check', file('wrong.json', JSON.stringify(states)));
    assert.equal(r.code, 2);
    assert.deepEqual(
        r.out.results.map((x: { ok: boolean }) => x.ok),
        [true, false, true],
    );
});

test('state: a tampered pledge exits 2 before any state is read', () => {
    const r = run('state-cli.ts', tampered(), '--headers', 'headers', '--height', '920000');
    assert.equal(r.code, 2);
    assert.equal(r.out.code, 'E_PLEDGE_BAD_SIG');
});

test('state --height: the state at the tip, with its times', () => {
    const r = run('state-cli.ts', PLEDGE, '--headers', 'headers', '--height', '920000');
    assert.equal(r.code, 0);
    assert.equal(r.out.state, 'resolvable');
    assert.equal(r.out.now, '2025-10-20T21:24:37Z');
});

test('state: a height with no header, or not a number, exits 1', () => {
    assert.equal(run('state-cli.ts', PLEDGE, '--headers', 'headers', '--height', '919500').code, 1);
    assert.equal(run('state-cli.ts', PLEDGE, '--headers', 'headers', '--height', '92e4').code, 1);
    assert.equal(run('state-cli.ts', PLEDGE, '--headers', 'headers').code, 1);
});
