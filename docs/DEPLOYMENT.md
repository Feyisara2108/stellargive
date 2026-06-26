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

## 7. Frontend Deployment & Preview Environments (Vercel)

Rapid feedback requires robust preview environments. To configure Vercel with auto-deploying Pull Request (PR) previews using isolated testnet parameters:

### 1. Link Repository & Set Framework
1. Log in to the Vercel Dashboard, click **Add New** > **Project**, and import your GitHub repository.
2. Select **Next.js** as the Framework Preset.
3. Keep the root directory set to `frontend`.

### 2. Configure Environment Variables per Environment
Vercel allows assigning environment variables to specific target environments (**Production**, **Preview**, and **Development**). Use this isolation to ensure preview URLs point to Stellar Testnet contracts, while the main production site targets the Mainnet contract:

| Environment Variable | Target Environment | Value / Source |
|---|---|---|
| `NEXT_PUBLIC_CONTRACT_ID` | **Preview** & **Development** | Testnet Contract ID (e.g., `CB6...`) |
| `NEXT_PUBLIC_CONTRACT_ID` | **Production** | Mainnet Contract ID (e.g., `CC...`) |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | **Preview** & **Development** | Testnet RPC: `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | **Production** | Mainnet RPC / custom production endpoint |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | **Preview** & **Development** | `Test SDF Network ; September 2015` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | **Production** | `Public Global Stellar Network ; October 2015` |

Make sure to deselect the environments appropriately when adding each key to prevent preview URLs from pulling Mainnet configuration.

### 3. Enable Preview Deployments in Vercel Git Settings
1. In your Vercel project, go to **Settings** > **Git**.
2. Under the **Preview Deployments** section, ensure auto-deployments are **Enabled** for all branch pushes except the production branch (`main`).

### 4. Require Status Checks in GitHub
To prevent merging un-verified PRs:
1. In your GitHub repository, navigate to **Settings** > **Branches**.
2. Click **Add Rule** under Branch Protection Rules (or edit the rule for `main`).
3. Check **Require status checks to pass before merging**.
4. Search for and check the **Vercel - Preview** status check.
5. Save the protection rule. This requires any Pull Request to deploy successfully on Vercel before it can be merged.


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

---

## Idempotency, Verification, and Rollback

### Idempotent re-runs

`deploy-contract.sh` writes a deployment record to `scripts/deployments.json` after every
successful deploy.  On subsequent runs the script reads that record and **skips the deploy**
if an entry already exists for the target network.  Pass `--force` to override:

```bash
./scripts/deploy-contract.sh                   # no-op if already deployed
./scripts/deploy-contract.sh --force           # redeploy unconditionally
./scripts/deploy-contract.sh --network mainnet # separate record per network
```

### Verifying a deployment

**1. Check the WASM hash**

```bash
stellar contract info --id <CONTRACT_ID> --network testnet
```

Compare the printed hash against `wasmHash` in `scripts/deployments.json`.

**2. Invoke a read-only entry-point**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- version
```

**3. Check the deployment log**

```bash
tail -50 scripts/deployments.log
```

### Rollback procedure

Soroban contracts are immutable once deployed; "rollback" means re-pointing the frontend
to a previously-deployed contract ID.

**Step 1 — Restore the frontend env pointer**

```bash
# The script backs up .env.local automatically; restore it:
cp frontend/.env.local.bak frontend/.env.local

# Or edit manually:
# NEXT_PUBLIC_CONTRACT_ID=<PREVIOUS_CONTRACT_ID>
```

**Step 2 — Update the deployment record**

Edit `scripts/deployments.json` (or delete it) so the next deploy run picks it up correctly.

**Step 3 — Verify the old contract is still live**

```bash
stellar contract invoke \
  --id <PREVIOUS_CONTRACT_ID> \
  --network testnet \
  -- version
```
