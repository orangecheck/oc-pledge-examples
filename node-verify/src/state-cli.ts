// yarn -s state <file.pledge> --headers <dir> --height <N> [--now <ISO 8601 UTC>]
// yarn -s state <file.pledge> --headers <dir> --check <states.json>
// The pledge is verified first. Exit 0 done (with --check: every state as expected),
// 1 bad input, 2 the pledge does not verify or a state is not the one expected.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { PledgeError, type PledgeEnvelope } from '@orangecheck/pledge-core';

import { headersFromDir, pledgeStateAt } from './pledge-state.js';
import { verifyPledgeText } from './verify-pledge.js';

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        headers: { type: 'string' },
        height: { type: 'string' },
        now: { type: 'string' },
        check: { type: 'string' },
    },
});

function out(result: Record<string, unknown>, code: number): never {
    console.log(JSON.stringify(result, null, 2));
    process.exit(code);
}

const usage = 'usage: state <file.pledge> --headers <dir> (--height <N> [--now <ISO>] | --check <states.json>)';
const [path] = positionals;
if (!path || positionals.length > 1 || !values.headers || (values.height === undefined) === (values.check === undefined)) {
    console.error(usage);
    process.exit(1);
}

interface Expected {
    height: number;
    now?: string;
    state: string;
    from: string;
}

let text: string;
let expected: Expected[] | undefined;
try {
    text = await readFile(path, 'utf8');
    if (values.check) expected = JSON.parse(await readFile(values.check, 'utf8')) as Expected[];
} catch (e) {
    out({ ok: false, code: 'E_INPUT', message: e instanceof Error ? e.message : String(e) }, 1);
}

let pledge: PledgeEnvelope;
try {
    const verified = await verifyPledgeText(text);
    if (!verified.ok) out({ ok: false, code: verified.code, message: verified.message }, 2);
    pledge = verified.envelope;
} catch (e) {
    if (e instanceof PledgeError) out({ ok: false, code: e.code, message: e.message }, 1);
    throw e;
}

const headers = headersFromDir(values.headers);
try {
    if (expected) {
        const results = [];
        for (const want of expected) {
            const got = await pledgeStateAt(pledge, { height: want.height, now: want.now, headers });
            results.push({ ...want, got: got.state, ok: got.state === want.state });
        }
        const ok = results.every((r) => r.ok);
        out({ ok, id: pledge.id, results }, ok ? 0 : 2);
    }
    const height = Number(values.height);
    if (!/^\d+$/.test(values.height!)) out({ ok: false, code: 'E_INPUT', message: '--height must be a whole number' }, 1);
    const report = await pledgeStateAt(pledge, { height, now: values.now, headers });
    out({ ok: true, id: pledge.id, ...report }, 0);
} catch (e) {
    out({ ok: false, code: 'E_INPUT', message: e instanceof Error ? e.message : String(e) }, 1);
}
