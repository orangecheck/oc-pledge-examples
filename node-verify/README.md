# node-verify

Verify an OC Pledge in Node with [`@orangecheck/pledge-core`](https://npmjs.com/package/@orangecheck/pledge-core) and [`@orangecheck/bip322`](https://npmjs.com/package/@orangecheck/bip322), then resolve its state at a block height. Every check runs on your machine. No pledge service or relay is asked.

## Run it

```sh
yarn install
yarn -s verify pledges/6b16764e210c766086f5dc0be7dca2727a56ddc6c92a6377e5c01b1653e5910e.pledge
```

```json
{
  "ok": true,
  "id": "6b16764e210c766086f5dc0be7dca2727a56ddc6c92a6377e5c01b1653e5910e",
  "swearer": "bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw",
  "proposition": "I will not spend the bonded UTXO before block 920000.",
  "mechanism": "chain_state",
  "resolves_at": {
    "block": 920000
  },
  "expires_at": "2026-12-31T00:00:00Z",
  "sworn_at": "2026-04-24T18:30:00Z"
}
```

Exit codes: `0` verified, `1` bad input, `2` verification failed.

Then its state, as a chain whose tip is block 919000 sees it:

```sh
yarn -s state pledges/6b16764e….pledge --headers headers --height 919000 --now 2026-04-25T00:00:00Z
```

```json
{
  "ok": true,
  "id": "6b16764e210c766086f5dc0be7dca2727a56ddc6c92a6377e5c01b1653e5910e",
  "state": "pending",
  "now": "2026-04-25T00:00:00Z",
  "height": 919000,
  "tip_time": "2025-10-14T08:46:28Z",
  "resolves_at_time": null,
  "expires_at": "2026-12-31T00:00:00Z"
}
```

Options:

- `--headers <dir>`: a folder of `<height>.hex` files, one 80-byte block header each. It must hold the tip, and the block the pledge resolves at once the tip has reached it.
- `--height <N>`: the tip. `now` defaults to the tip header's timestamp.
- `--now <ISO 8601 UTC>`: the time to classify at.
- `--check <states.json>`: instead of one height, every `{height, now, state}` in the file. Exit `2` if any state differs.

The pledge is verified first: one that fails exits `2` before any state is read. Otherwise exit codes are `0` done, `1` bad input (a missing header included).

## What it checks

`src/verify-pledge.ts`, `src/pledge-state.ts` and `src/sign-pledge.ts` are the whole integration; the two CLIs only read files and print.

1. `verifyPledge` from pledge-core checks each field's form, rebuilds the canonical message (SPEC §3.1), hashes it and compares that with the pledge's `id` (§3.2). Any changed field gives another id.
2. `verifySignature` from bip322 checks the signature over that id for the swearer's address (§3.5). P2PKH, P2SH-P2WPKH, P2WPKH and P2TR all verify.
3. `pledgeStateAt` runs SPEC §4.4 for a pledge with no outcome and no abandonment. A pledge that resolves at a block resolves at that block's header timestamp, read from bytes 68 to 71 of its header; until the tip reaches it, it does not resolve. `classifyState` from pledge-core then gives one of `pending`, `resolvable` or `expired_unresolved`.

It does not check the bond. SPEC §4.4's `pending` assumes a bond verified at `sworn_at`; run `verifyBond` from pledge-core against the attestation if the bond matters to you. It reads no outcome or abandonment envelope either, so it never returns `kept`, `broken` or `disputed`.

## Sign one

`signPledge` in `src/sign-pledge.ts` swears a pledge from a private key: `createPledge` builds the canonical message and id, and bip322 signs the id. `pledgeFileText` writes the `.pledge` file. In real use a wallet signs: compute the id with `computePledgeId`, have the wallet sign that 64-character hex string with BIP-322, and wrap the signature with `wrapPledgeEnvelope`.

## What you trust

The swearer's address, and the block headers. The two in `headers/` were read from mempool.space and blockstream.info on 2026-11-11; both gave the same block hashes, and the tests check those hashes. Live CI compares them with mempool.space's headers every week. To trust no one, take headers from your own node: `bitcoin-cli getblockheader $(bitcoin-cli getblockhash 920000) false`.

A block's timestamp is set by its miner, within the limits consensus allows. A pledge that resolves at a block resolves at that time, not at the moment the block reached you.

## The committed pledge

`pledges/6b16764e….pledge` is oc-pledge-protocol's vector v61 (main `e46b5198`): the spec's minimal chain-state pledge, sworn by `bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw`. It was signed with `signPledge` from v61's disclosed burn key, `01` repeated 32 times, and came out byte for byte as v61's envelope, signature included. Never send funds to that address: anyone can spend from it. Its bond names a placeholder attestation, `11…11`, so there is no bond to check.

`states.json` holds its state at three fixed points, taken from the spec's state vectors: pending at block 919000 (v23, the same pledge under another address), resolvable at 920000 (v24's rule) and expired_unresolved after `expires_at` (v27's rule).

## Test

```sh
yarn test
```

With no network: oc-pledge-protocol's signed vectors v59 to v62 (one per address type) verify and v63 (one signature byte changed) is refused. The committed pledge verifies, equals v61, and signing v61's terms again writes it byte for byte. One signature byte changed, a signature from another key, and a changed term are each refused. The state vectors v23, v24 and v27 give their expected states, and every point in `states.json` holds. A resolve block the tip has not reached leaves the pledge pending; once the tip is past it, the pledge resolves at that block's time, not the tip's. A missing or malformed header throws. Both CLIs give the exit codes above.
