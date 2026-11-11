// The spec's signed vectors and the committed pledge, verified with no network.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { PledgeError, type CreatePledgeTerms } from '@orangecheck/pledge-core';

import { pledgeFileText, signPledge } from '../src/sign-pledge.js';
import { verifyPledgeText } from '../src/verify-pledge.js';

const PLEDGE_ID = '6b16764e210c766086f5dc0be7dca2727a56ddc6c92a6377e5c01b1653e5910e';
/** v61's disclosed burn key. Never send funds to its address. */
const BURN_KEY = '01'.repeat(32);
const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const committed = (): string => readFileSync(here(`pledges/${PLEDGE_ID}.pledge`), 'utf8');

interface Vector {
    inputs: Record<string, any>;
    expected: { pledge_id: string; envelope: Record<string, any> };
    signature_check: { address_type: string; expected: { outcome: 'ACCEPT' | 'REJECT'; error_code?: string } };
}
const vector = (name: string): Vector => JSON.parse(readFileSync(here(`vectors/${name}.json`), 'utf8'));

/** v61's terms, as a forker would pass them to signPledge. */
function v61Terms(): Omit<CreatePledgeTerms, 'swearer'> {
    const { swearer: _swearer, sworn_at, nonce, ...terms } = vector('v61-sig-p2wpkh').inputs;
    return { ...terms, swornAt: sworn_at, nonce } as Omit<CreatePledgeTerms, 'swearer'>;
}

function edited(edit: (env: Record<string, any>) => void): string {
    const env = JSON.parse(committed());
    edit(env);
    return JSON.stringify(env);
}

for (const name of ['v59-sig-p2pkh', 'v60-sig-p2sh-p2wpkh', 'v61-sig-p2wpkh', 'v62-sig-p2tr']) {
    test(`${name} verifies`, async () => {
        const v = vector(name);
        assert.equal(v.signature_check.expected.outcome, 'ACCEPT');
        const r = await verifyPledgeText(JSON.stringify(v.expected.envelope));
        assert.equal(r.ok, true, JSON.stringify(r));
        assert.equal(r.ok && r.id, v.expected.pledge_id);
    });
}

test('v63, one signature byte flipped, is refused', async () => {
    const v = vector('v63-sig-tampered');
    const r = await verifyPledgeText(JSON.stringify(v.expected.envelope));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.code, v.signature_check.expected.error_code);
    assert.equal(v.signature_check.expected.error_code, 'E_PLEDGE_BAD_SIG');
});

test('the committed pledge verifies and is v61', async () => {
    const r = await verifyPledgeText(committed());
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.ok && r.id, PLEDGE_ID);
    assert.deepEqual(JSON.parse(committed()), vector('v61-sig-p2wpkh').expected.envelope);
});

test('signing v61 terms with the burn key writes the committed file byte for byte', async () => {
    const env = await signPledge(v61Terms(), BURN_KEY);
    assert.equal(env.swearer.address, 'bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw');
    assert.equal(pledgeFileText(env), committed());
});

test('a signature with one byte changed is refused', async () => {
    const text = edited((env) => {
        const bytes = Buffer.from(env.sig.value, 'base64');
        bytes[10]! ^= 0x01;
        env.sig.value = bytes.toString('base64');
    });
    const r = await verifyPledgeText(text);
    assert.equal(!r.ok && r.code, 'E_PLEDGE_BAD_SIG');
});

test('a changed term no longer matches the id', async () => {
    const text = edited((env) => {
        env.resolves_at = { block: 920001 };
    });
    const r = await verifyPledgeText(text);
    assert.equal(!r.ok && r.code, 'E_PLEDGE_BAD_ID');
});

test('a signature from another key is refused', async () => {
    const other = await signPledge(v61Terms(), '02'.repeat(32));
    const text = edited((env) => {
        env.sig.value = other.sig.value;
    });
    const r = await verifyPledgeText(text);
    assert.equal(!r.ok && r.code, 'E_PLEDGE_BAD_SIG');
});

test('text that is not a JSON object throws', async () => {
    for (const text of ['not json', '[]', 'null']) {
        await assert.rejects(verifyPledgeText(text), (e: unknown) => e instanceof PledgeError && e.code === 'E_PLEDGE_MALFORMED');
    }
});
