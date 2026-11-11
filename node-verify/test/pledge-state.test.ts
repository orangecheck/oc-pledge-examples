// SPEC §4.4 for the committed pledge at fixed heights, read from block headers
// committed beside it, and for the spec's own state vectors. No network.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { wrapPledgeEnvelope, type PledgeEnvelope } from '@orangecheck/pledge-core';

import { headersFromDir, headerTime, pledgeStateAt } from '../src/pledge-state.js';

const PLEDGE_ID = '6b16764e210c766086f5dc0be7dca2727a56ddc6c92a6377e5c01b1653e5910e';
const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const headers = headersFromDir(here('headers'));
const committed = (): PledgeEnvelope => JSON.parse(readFileSync(here(`pledges/${PLEDGE_ID}.pledge`), 'utf8'));

/** A spec state vector's pledge, with a placeholder signature: SPEC §4.4 reads no signature. */
function statePledge(name: string): { pledge: PledgeEnvelope; now: string; height?: number; state: string } {
    const v = JSON.parse(readFileSync(here(`vectors/${name}.json`), 'utf8'));
    const pledge = wrapPledgeEnvelope(v.inputs.pledge, 'placeholder');
    assert.equal(pledge.id, v.inputs.pledge_id, `${name}'s id is recomputed`);
    assert.equal(v.inputs.outcome_envelope ?? null, null);
    assert.equal(v.inputs.abandonment_envelope ?? null, null);
    return { pledge, now: v.inputs.now, height: v.inputs.chain_height, state: v.expected.state };
}

/** Block hash: double SHA-256 of the header, shown byte-reversed. */
const blockHash = (h: Uint8Array): string =>
    Buffer.from(createHash('sha256').update(createHash('sha256').update(h).digest()).digest()).reverse().toString('hex');

test('the committed headers are blocks 919000 and 920000', async () => {
    const h919 = await headers.getHeaderAt(919_000);
    const h920 = await headers.getHeaderAt(920_000);
    assert.equal(blockHash(h919), '0000000000000000000025a1ca2f3c10caca7bf0950abea5ab47471c1782205f');
    assert.equal(blockHash(h920), '000000000000000000005e9de5d9e008d923ced659896d9ad012e347882bdc87');
    assert.equal(headerTime(h919), '2025-10-14T08:46:28Z');
    assert.equal(headerTime(h920), '2025-10-20T21:24:37Z');
});

test('v23: a block not yet mined is pending', async () => {
    const v = statePledge('v23-state-pending');
    assert.equal(v.state, 'pending');
    assert.equal(v.height, 919_000);
    const r = await pledgeStateAt(v.pledge, { height: v.height, now: v.now, headers });
    assert.equal(r.state, 'pending');
    assert.equal(r.resolves_at_time, null);
});

for (const name of ['v24-state-resolvable', 'v27-state-expired-unresolved']) {
    test(`${name.slice(0, 3)}: ${name.slice(10)}`, async () => {
        const v = statePledge(name);
        const r = await pledgeStateAt(v.pledge, { now: v.now });
        assert.equal(r.state, v.state);
        assert.equal(r.resolves_at_time, (v.pledge.resolves_at as { time: string }).time);
    });
}

const fixed: { height: number; now?: string; state: string; from: string }[] = JSON.parse(
    readFileSync(here('states.json'), 'utf8'),
);

for (const want of fixed) {
    test(`the committed pledge at ${want.height}${want.now ? `, ${want.now}` : ''} is ${want.state}`, async () => {
        const r = await pledgeStateAt(committed(), { height: want.height, now: want.now, headers });
        assert.equal(r.state, want.state);
    });
}

test('states.json takes its points from the spec vectors', () => {
    assert.deepEqual(
        fixed.map((f) => f.state),
        ['pending', 'resolvable', 'expired_unresolved'],
    );
    assert.equal(fixed[0]!.now, statePledge('v23-state-pending').now);
    assert.equal(fixed[0]!.height, statePledge('v23-state-pending').height);
});

test('a mined resolve block resolves at its header time', async () => {
    const r = await pledgeStateAt(committed(), { height: 920_000, headers });
    assert.equal(r.resolves_at_time, '2025-10-20T21:24:37Z');
    assert.equal(r.now, '2025-10-20T21:24:37Z', 'now defaults to the tip header time');
    assert.equal(r.state, 'resolvable');
});

test('past the resolve block, it resolves at the time of that block, not of the tip', async () => {
    const h920 = await headers.getHeaderAt(920_000);
    const tip = Uint8Array.from(h920);
    const seconds = new DataView(h920.buffer, h920.byteOffset, 80).getUint32(68, true);
    new DataView(tip.buffer).setUint32(68, seconds + 86_400, true);
    const chain = { getHeaderAt: async (h: number) => (h === 920_144 ? tip : headers.getHeaderAt(h)) };
    const r = await pledgeStateAt(committed(), { height: 920_144, now: '2025-10-20T22:24:37Z', headers: chain });
    assert.equal(r.tip_time, '2025-10-21T21:24:37Z');
    assert.equal(r.resolves_at_time, '2025-10-20T21:24:37Z');
    assert.equal(r.state, 'resolvable');
});

test('past expires_at with the block unmined is still expired, not pending', async () => {
    const r = await pledgeStateAt(committed(), { height: 919_000, now: '2027-01-01T00:00:00Z', headers });
    assert.equal(r.state, 'expired_unresolved');
});

test('a pledge that resolves at a block needs a height', async () => {
    await assert.rejects(pledgeStateAt(committed(), { now: '2026-04-25T00:00:00Z' }), /needs a height/);
});

test('a missing or malformed header throws', async () => {
    await assert.rejects(headers.getHeaderAt(919_500), /no header for block 919500/);
    const dir = mkdtempSync(join(tmpdir(), 'pledge-headers-'));
    try {
        writeFileSync(join(dir, '920000.hex'), 'ab'.repeat(79));
        await assert.rejects(headersFromDir(dir).getHeaderAt(920_000), /not an 80-byte header/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
