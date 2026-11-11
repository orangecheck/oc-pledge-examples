import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import {
    canonicalizePledgeEnvelope,
    createPledge,
    type CreatePledgeTerms,
    type PledgeEnvelope,
} from '@orangecheck/pledge-core';

/**
 * A pledge sworn by the P2WPKH address of `privateKey` (hex or WIF).
 * createPledge builds the canonical message and its id (SPEC §3.1, §3.2), and
 * the key signs that id in BIP-322 simple form (§3.5). In real use a wallet
 * signs: compute the id with computePledgeId, have the wallet sign that hex
 * string, and wrap the signature with wrapPledgeEnvelope.
 */
export async function signPledge(
    terms: Omit<CreatePledgeTerms, 'swearer'>,
    privateKey: string,
): Promise<PledgeEnvelope> {
    const address = addressFromPrivateKey(privateKey, 'p2wpkh');
    return createPledge({
        ...terms,
        swearer: address,
        swearerSigner: { address, signMessage: async (id) => signMessage(address, id, privateKey) },
    });
}

/** A `.pledge` file's text: the keys sorted as SPEC §6 sorts them, indented for reading, one LF at the end. */
export function pledgeFileText(envelope: PledgeEnvelope): string {
    return JSON.stringify(JSON.parse(canonicalizePledgeEnvelope(envelope)), null, 4) + '\n';
}
