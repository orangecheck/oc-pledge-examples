// yarn -s verify <file.pledge>
// Exit 0 verified, 1 bad input, 2 verification failed.
import { readFile } from 'node:fs/promises';

import { PledgeError } from '@orangecheck/pledge-core';

import { verifyPledgeText } from './verify-pledge.js';

function out(result: Record<string, unknown>, code: number): never {
    console.log(JSON.stringify(result, null, 2));
    process.exit(code);
}

const [path, ...rest] = process.argv.slice(2);
if (!path || rest.length > 0) {
    console.error('usage: verify <file.pledge>');
    process.exit(1);
}

let text: string;
try {
    text = await readFile(path, 'utf8');
} catch (e) {
    out({ ok: false, code: 'E_INPUT', message: e instanceof Error ? e.message : String(e) }, 1);
}

let result;
try {
    result = await verifyPledgeText(text);
} catch (e) {
    if (e instanceof PledgeError) out({ ok: false, code: e.code, message: e.message }, 1);
    throw e;
}
if (!result.ok) out({ ok: false, code: result.code, message: result.message }, 2);

const env = result.envelope;
out(
    {
        ok: true,
        id: result.id,
        swearer: env.swearer.address,
        proposition: env.proposition,
        mechanism: env.resolution.mechanism,
        resolves_at: env.resolves_at,
        expires_at: env.expires_at,
        sworn_at: env.sworn_at,
    },
    0,
);
