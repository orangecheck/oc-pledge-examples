import { verifySignature } from '@orangecheck/bip322';
import {
    PledgeError,
    verifyPledge,
    type PledgeEnvelope,
    type VerifyPledgeResult,
} from '@orangecheck/pledge-core';

/**
 * SPEC §9 on your machine: the canonical message rebuilt from the envelope's
 * fields, its SHA-256 compared with the pledge's `id`, and the BIP-322
 * signature over that id checked for the signer's address. Throws PledgeError
 * when the text is not a JSON object.
 */
export async function verifyPledgeText(text: string): Promise<VerifyPledgeResult> {
    let envelope: unknown;
    try {
        envelope = JSON.parse(text);
    } catch {
        throw new PledgeError('E_PLEDGE_MALFORMED', 'not JSON');
    }
    if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope)) {
        throw new PledgeError('E_PLEDGE_MALFORMED', 'not a JSON object');
    }
    return verifyPledge({
        envelope: envelope as PledgeEnvelope,
        verifyBip322: async (message, signature, address) => verifySignature(address, message, signature),
    });
}
