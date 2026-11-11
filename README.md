# oc-pledge-examples

Copy-forkable integrations of [OC Pledge](https://github.com/orangecheck/oc-pledge-protocol): swear a commitment with your Bitcoin address, check it offline, and read its state from the chain. Each subdirectory is a standalone template. Fork it, put in your own pledge, ship.

## What's in here

| Path | What it is |
|---|---|
| [`node-verify/`](./node-verify) | Verify a `.pledge` in Node with `pledge-core` and `bip322`: the id and the BIP-322 signature, then its state (SPEC §4.4) at a block height, read from block headers you supply. Ships one pledge signed from the spec's disclosed P2WPKH burn key, and the headers of blocks 919000 and 920000. |

## Shared assumptions

- You have a **Bitcoin wallet** that signs BIP-322 messages (UniSat, Xverse, Leather, OKX, Phantom), or any offline BIP-322 signer. The wallet signs the pledge's 64-character id, never the terms (SPEC §3.5).
- Node 22 or newer, and yarn 1.

## What you trust

A pledge checks with no service asked. The signature needs only the swearer's address. A pledge that resolves at a block needs that block's header and the tip's: from your own node, or from a source you name. `node-verify` reads them from a folder you fill.

The weekly Live job reads the current tip and its headers from [mempool.space](https://mempool.space/docs/api/rest), the one service anything here reads. Nothing here publishes to a relay.

## Running locally

Each subdirectory has its own `README.md` and its own lockfile. None of them share deps. cd in, `yarn install`, `yarn test`.

## CI

- **Templates**, on every push and pull request: each template installed from its lockfile, type-checked and tested.
- **Live**, weekly: the same against the latest published packages. Then the committed pledge is verified offline, its fixed states are checked against the committed headers, those headers are compared with mempool.space's, and its state is resolved at the current tip from mempool.space. A copy with one signature byte changed must fail.
- **Hygiene**: no secrets in the history, no home-directory paths.

## License

MIT. Fork freely.

## Related

- **Protocol**: [`orangecheck/oc-pledge-protocol`](https://github.com/orangecheck/oc-pledge-protocol)
- **Web client**: [`pledge.ochk.io`](https://pledge.ochk.io)
- **Library**: [`@orangecheck/pledge-core`](https://npmjs.com/package/@orangecheck/pledge-core)
