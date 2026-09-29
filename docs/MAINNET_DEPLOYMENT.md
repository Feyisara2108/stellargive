# Mainnet Deployment Guide

This guide details the procedures and requirements for securely deploying the StellarGive smart contract to the Stellar Mainnet.

## Table of Contents
- [Deployment Overview](#deployment-overview)
- [Security Checklist](#security-checklist)
- [Testnet Soak Requirements](#testnet-soak-requirements)
- [WASM Verification](#wasm-verification)
- [Secret Management](#secret-management)
- [Access Control Recommendations](#access-control-recommendations)
- [Multi-Signature Administration](#multi-signature-administration)
- [Deployment Verification Section](#deployment-verification-section)
- [Recovery Procedures](#recovery-procedures)

## Deployment Overview

This section covers the foundational prerequisites and roles for a secure deployment.

- **Deployment Prerequisites:** Ensure all code is audited, tests pass, and dry-runs have succeeded.
- **Roles and Responsibilities:**
  - *Deployer:* Responsible for executing the deployment scripts.
  - *Security Reviewer:* Validates the WASM hash and deployment parameters.
  - *Signers:* Approve any required multi-sig transactions.
- **Required Tooling Versions:**
  - Rust/Cargo: (latest stable recommended)
  - `soroban-cli`: Match the version used during testnet soak.
- **Rollback Considerations:** Smart contracts on Stellar cannot be easily "deleted". Rollback generally involves upgrading to a patched version or initiating an emergency pause.
- **Emergency Contacts/Process:** Establish a clear communication channel (e.g., dedicated Slack channel or pager) with the core team before initiating deployment.

## Security Checklist

A mandatory pre-deployment checklist to ensure the contract's safety.

### Smart Contract Review
- [ ] Contract audited
- [ ] Critical issues resolved
- [ ] Medium issues reviewed
- [ ] No known vulnerabilities

### Authentication Review
- [ ] All admin functions protected
- [ ] `require_auth()` verified
- [ ] Privilege escalation reviewed

### Arithmetic Safety
- [ ] Overflow protection verified
- [ ] Underflow protection verified
- [ ] Large-value edge cases tested

### Event Validation
- [ ] All important state changes emit events
- [ ] Event schema documented

### Storage Review
- [ ] Storage keys namespaced
- [ ] No storage collision risks

### Operational Readiness
- [ ] Monitoring configured
- [ ] Alerting configured
- [ ] Recovery procedure documented

## Testnet Soak Requirements

A mandatory soak period on Testnet ensures stability under realistic conditions.

**Minimum Testnet Soak:**
- 7 consecutive days
- No critical errors
- No failed user transactions
- Successful milestone creation
- Successful donations
- Successful campaign completion

## WASM Verification

Verify the compiled WebAssembly binary before deployment to ensure reproducibility and correctness.

**Build Command:**
```bash
cargo build --target wasm32-unknown-unknown --release
```

**Verification Command:**
```bash
ls -lh target/wasm32-unknown-unknown/release/*.wasm
```

**Checklist:**
- [ ] WASM size verified
- [ ] Build reproducible
- [ ] Release build used
- [ ] Contract hash recorded

## Secret Management

Secure key handling is critical. 

**Requirements:**
- Never commit secret keys
- Never store secrets in source code
- Never store secrets in `.env.example`

### GitHub Secrets

The following secrets are required for automated or manual deployments:

- `MAINNET_SECRET_KEY`: Used to sign the deployment transaction.
  - *Access:* Highly restricted, deployers only.
  - *Rotation:* Rotate if compromised or during routine scheduled key rotation.
- `MAINNET_RPC_URL`: The RPC endpoint for mainnet interactions.
  - *Access:* Admin/DevOps team.
  - *Rotation:* If provider access is compromised.
- `MAINNET_NETWORK_PASSPHRASE`: Mainnet identifier (`Public Global Stellar Network ; September 2015`).
  - *Access:* General, but best kept in configuration.
  - *Rotation:* N/A.
- `MAINNET_ADMIN_ADDRESS`: The address assigned admin privileges post-deployment.
  - *Access:* Admin team.
  - *Rotation:* Rotate admin via contract functions if necessary.

## Access Control Recommendations

Implement the following to secure the deployment pipeline:
- **Least Privilege Access:** Grant only necessary permissions to deployer keys and personnel.
- **Protected Branches:** Enforce protection rules on the `main` branch.
- **Required PR Reviews:** Require at least two approvals for code merging.
- **Deployment Approvals:** Require manual approval in GitHub Actions before executing the mainnet deployment step.
- **Environment Protection:** The `production` environment in GitHub Actions requires reviewer approval before any deployment can proceed. This is configured in the repository settings under Settings > Environments > production. At least one reviewer must approve the workflow run before the deployment steps execute.

## Multi-Signature Administration

Governance and administrative control should not rely on a single point of failure.

### Administrative Actions
The following actions require multi-sig authorization:
- Contract upgrades
- Emergency pause
- Parameter changes
- Treasury withdrawals

### Multi-Sig Recommendations

**Recommended:**
3-of-5 multisig

**Signers:**
- Lead maintainer
- Security reviewer
- Operations maintainer
- Community representative
- Backup signer

**Procedures:**
- *Signer Rotation Process:* Use Stellar's native account operations to add or remove signers.
- *Lost Key Recovery Process:* With 3-of-5, up to two keys can be lost without losing control. The remaining signers must rotate out the lost keys immediately.
- *Emergency Escalation Process:* Signers must coordinate via secure, out-of-band communication during critical incidents.

## Deployment Verification Section

Post-deployment verification ensures the contract is functioning as expected.

### Checklist
After future deployment:
- [ ] Contract address recorded
- [ ] Contract callable
- [ ] Admin initialized
- [ ] Events emitted correctly
- [ ] Donations function correctly
- [ ] Campaign creation works
- [ ] Explorer visibility confirmed

**Example Verification Command:**
```bash
soroban contract read --id <CONTRACT_ADDRESS> --network mainnet --source admin
```

## Recovery Procedures

### Failed Deployment

Steps:
1. Stop deployment
2. Review logs
3. Verify contract hash
4. Fix issue
5. Re-run dry-run

### Compromised Key

Steps:
1. Revoke access
2. Rotate secrets
3. Replace signer
4. Audit transactions

### Emergency Pause

If the contract implements an emergency pause feature:
- Authorized admins/multi-sig must immediately call the pause function to halt critical operations (like withdrawals).
- Once paused, investigate the root cause, develop a patch, and deploy an upgrade before unpausing.
