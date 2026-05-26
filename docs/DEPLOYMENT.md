# Deployment Guide

This guide covers Soroban testnet deployment first, then production/mainnet readiness.

## 0. Current Testnet Deployment (Already Live)

- **Contract ID:** `CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT`
- **Network:** Stellar Testnet
- **RPC URL:** `https://soroban-testnet.stellar.org`
- **Network passphrase:** `Test SDF Network ; September 2015`
- **Deploy tx:** `e3f88cee225bb5548e4640afe02c351373575469fb60dac6f5de670aa7687156`
- **Explorer:** `https://stellar.expert/explorer/testnet/tx/e3f88cee225bb5548e4640afe02c351373575469fb60dac6f5de670aa7687156`
- **Lab contract:** `https://lab.stellar.org/r/testnet/contract/CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT`

If you only need local/frontend development, set this contract ID in `frontend/.env.local` and skip sections 3-4.

## 1. Prerequisites

Install and verify:

```bash
stellar --version
rustc --version
node --version
```

Configure Stellar network profile (if missing):

```bash
stellar network add --global testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"
```

## 2. Prepare Environment

```bash
cp .env.example .env
cp .env.example frontend/.env.local
```

Set:
- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `STELLAR_NETWORK_PASSPHRASE`
- `NEXT_PUBLIC_CONTRACT_ADDRESS` (use current deployed ID or fill after deploy)

## 3. Fund a Testnet Identity

```bash
./scripts/fund-testnet.sh --alias copilot-deployer
```

This creates/uses the alias and funds it through Friendbot.

## 4. Deploy Contract to Testnet

```bash
./scripts/deploy-contract.sh --network testnet --source copilot-deployer
```

Script actions:
1. Builds release Wasm (`wasm32-unknown-unknown`)
2. Deploys via `stellar contract deploy`
3. Writes contract ID to `frontend/.env.local`
4. Prints explorer link and RPC reference

## 5. Verify Deployment

```bash
stellar contract inspect --id "$NEXT_PUBLIC_CONTRACT_ADDRESS" --network testnet
```

Example with the current live contract:

```bash
stellar contract inspect \
  --id CB6HVHRQYILGNKW7RBB66BC6TDBIEWADOA2YUUV4I22RXRLA6DY6OAKT \
  --network testnet
```

Also validate:
- Contract ID in `frontend/.env.local`
- Frontend points to testnet RPC
- Donation/create/claim flows simulate and submit correctly

## 6. Sync ABI to Frontend

```bash
./scripts/sync-abi.sh --contract-id "$NEXT_PUBLIC_CONTRACT_ADDRESS" --network testnet
```

Outputs:
- `frontend/src/lib/contract/abi.json`
- `frontend/src/lib/contract/abi.ts`

## 7. Frontend Deployment (Vercel)

1. Import repository in Vercel.
2. Set project root to `frontend`.
3. Configure environment variables:
   - `NEXT_PUBLIC_SOROBAN_RPC_URL`
   - `NEXT_PUBLIC_CONTRACT_ADDRESS`
   - `STELLAR_NETWORK_PASSPHRASE` (if required by runtime code)
4. Build command: `npm run build`
5. Output: Next.js default output (App Router, non-static unless explicitly configured)

## 8. Contract Upgrade Path

If your contract architecture supports upgrade/admin patterns:

1. Build new Wasm.
2. Deploy new version to testnet.
3. Run regression tests against old and new IDs.
4. Update frontend env to new contract ID.
5. Communicate migration plan for in-flight campaigns.

If upgrades are not supported in current design, deploy immutable new contract IDs and migrate state at application layer.

## 9. Mainnet Migration Checklist

- [ ] Security checklist in `docs/SECURITY.md` completed
- [ ] Final Mainnet Audit Checklist in [`docs/MAINNET_AUDIT_CHECKLIST.md`](./MAINNET_AUDIT_CHECKLIST.md) completed
- [ ] Independent review of auth, token validation, and deadlines
- [ ] CI pipelines green on protected `main`
- [ ] Mainnet network profile configured correctly
- [ ] Mainnet funding source secured and access-controlled
- [ ] Frontend env switched to mainnet RPC + contract ID
- [ ] Rollback and incident response plan documented
