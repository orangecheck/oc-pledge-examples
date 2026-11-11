import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { classifyState, type PledgeEnvelope, type PledgeState } from '@orangecheck/pledge-core';

/** One 80-byte Bitcoin block header for a height. */
export interface HeaderSource {
    getHeaderAt(height: number): Promise<Uint8Array>;
}

export interface StateAt {
    /** The height the chain is read at, its tip for this question. */
    height?: number;
    /** ISO 8601 UTC. Defaults to the timestamp of the header at `height`. */
    now?: string;
    /** Needed for a pledge that resolves at a block. */
    headers?: HeaderSource;
}

export interface StateReport {
    state: PledgeState;
    now: string;
    height: number | null;
    tip_time: string | null;
    /** SPEC §4.4 resolves_at_normalized: the time given, the resolves block's timestamp, or null while that block is not mined. */
    resolves_at_time: string | null;
    expires_at: string;
}

/**
 * SPEC §4.4 for a pledge that no outcome or abandonment names, as a chain whose
 * tip is `height` sees it. A pledge that resolves at a block resolves at that
 * block's header timestamp, so the headers must hold both that block and the
 * tip. Signatures are not checked here: verify the pledge first.
 */
export async function pledgeStateAt(pledge: PledgeEnvelope, at: StateAt): Promise<StateReport> {
    const r = pledge.resolves_at;
    let chain: { tip_height: number; tip_time: string; blockTimes?: Record<number, string> } | undefined;
    let resolvesAtTime: string | null = 'time' in r ? r.time : null;
    if (at.height !== undefined) {
        if (!at.headers) throw new Error('a height needs a header source');
        const tipTime = headerTime(await at.headers.getHeaderAt(at.height));
        chain = { tip_height: at.height, tip_time: tipTime };
        if ('block' in r && at.height >= r.block) {
            resolvesAtTime = headerTime(await at.headers.getHeaderAt(r.block));
            chain.blockTimes = { [r.block]: resolvesAtTime };
        }
    } else if ('block' in r) {
        throw new Error(`this pledge resolves at block ${r.block}, so its state needs a height`);
    }
    const now = at.now ?? chain?.tip_time;
    if (now === undefined) throw new Error('give a time or a height');
    const state = classifyState({ pledge, outcome: null, abandonment: null, now, chain });
    return {
        state,
        now,
        height: at.height ?? null,
        tip_time: chain?.tip_time ?? null,
        resolves_at_time: resolvesAtTime,
        expires_at: pledge.expires_at,
    };
}

/** A header's timestamp (bytes 68 to 71, little-endian seconds) as ISO 8601 UTC. */
export function headerTime(header: Uint8Array): string {
    if (header.byteLength !== 80) throw new Error('a block header is 80 bytes');
    const seconds = new DataView(header.buffer, header.byteOffset, 80).getUint32(68, true);
    return new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
}

/**
 * Headers from a folder of `<height>.hex` files, one 80-byte header each, so a
 * state is read with no network. A missing or malformed file throws.
 */
export function headersFromDir(dir: string): HeaderSource {
    return {
        async getHeaderAt(height) {
            let hex: string;
            try {
                hex = (await readFile(join(dir, `${height}.hex`), 'utf8')).trim();
            } catch {
                throw new Error(`no header for block ${height} in ${dir}`);
            }
            if (!/^[0-9a-f]{160}$/.test(hex)) throw new Error(`${dir}/${height}.hex is not an 80-byte header in hex`);
            return Uint8Array.from(Buffer.from(hex, 'hex'));
        },
    };
}
