import {
  Address,
  Asset,
  Keypair,
  nativeToScVal,
  Operation,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  CONTRACT_ID,
  getCampaign,
  getEvents,
  NETWORK_PASSPHRASE,
  RPC_URL,
  server,
  submitTransactionWithKeypair,
} from "@/lib/soroban";

export const FRIENDBOT_URL =
  process.env.FRIENDBOT_URL || "http://localhost:8000/friendbot";

/** Minimum donation in stroops (matches contract `MIN_DONATION`). */
export const MIN_DONATION_STROOPS = 1_000_000n;

export function nativeTokenContractId(): string {
  // Standalone / local quickstart uses the classic native asset SAC id.
  return Asset.native().contractId(NETWORK_PASSPHRASE);
}

export async function waitForRpc(timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const latest = await server.getLatestLedger();
      if (latest?.sequence > 0) return;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Soroban RPC at ${RPC_URL} did not become ready within ${timeoutMs}ms`);
}

export async function fundAccount(publicKey: string): Promise<void> {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!res.ok) {
    throw new Error(`Friendbot failed for ${publicKey}: ${res.status} ${await res.text()}`);
  }
  // Wait until the account is visible to RPC.
  for (let i = 0; i < 30; i++) {
    try {
      await server.getAccount(publicKey);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`Account ${publicKey} not visible on RPC after Friendbot funding`);
}

export async function initializeContract(admin: Keypair): Promise<void> {
  await submitTransactionWithKeypair(admin, "initialize", [
    new Address(admin.publicKey()).toScVal(),
  ]);
}

export function buildCreateCampaignArgs(params: {
  creator: string;
  beneficiary: string;
  title: string;
  description: string;
  targetAmount: bigint;
  deadline: bigint;
  acceptedToken: string;
}) {
  const beneficiariesVal = xdr.ScVal.scvVec([
    xdr.ScVal.scvVec([
      new Address(params.beneficiary).toScVal(),
      nativeToScVal(10000, { type: "u32" }),
    ]),
  ]);

  return [
    new Address(params.creator).toScVal(),
    beneficiariesVal,
    nativeToScVal(params.title, { type: "string" }),
    nativeToScVal(params.description, { type: "string" }),
    nativeToScVal("https://example.com/meta", { type: "string" }),
    nativeToScVal("relief", { type: "symbol" }),
    nativeToScVal(params.targetAmount, { type: "i128" }),
    nativeToScVal(params.deadline, { type: "u64" }),
    new Address(params.acceptedToken).toScVal(),
    nativeToScVal(null, { type: "i128" }),
  ];
}

export async function createCampaign(
  creator: Keypair,
  overrides?: Partial<{
    title: string;
    description: string;
    targetAmount: bigint;
    deadline: bigint;
  }>,
): Promise<bigint> {
  const deadline =
    overrides?.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
  const args = buildCreateCampaignArgs({
    creator: creator.publicKey(),
    beneficiary: creator.publicKey(),
    title: overrides?.title ?? "Integration Test Campaign",
    description: overrides?.description ?? "Created by local-network integration suite",
    targetAmount: overrides?.targetAmount ?? 100_000_000_000n,
    deadline,
    acceptedToken: nativeTokenContractId(),
  });

  const result = await submitTransactionWithKeypair(creator, "create_campaign", args);
  return BigInt(scValToNative((result as any).returnValue));
}

export async function donate(
  donor: Keypair,
  campaignId: bigint,
  amount: bigint = MIN_DONATION_STROOPS,
  comment: string | null = null,
): Promise<void> {
  await submitTransactionWithKeypair(donor, "donate", [
    new Address(donor.publicKey()).toScVal(),
    nativeToScVal(campaignId, { type: "u64" }),
    nativeToScVal(amount, { type: "i128" }),
    nativeToScVal(false, { type: "bool" }),
    comment === null
      ? nativeToScVal(null, { type: "string" })
      : nativeToScVal(comment, { type: "string" }),
  ]);
}

export async function cancelCampaign(creator: Keypair, campaignId: bigint): Promise<void> {
  await submitTransactionWithKeypair(creator, "cancel_campaign", [
    nativeToScVal(campaignId, { type: "u64" }),
  ]);
}

export async function claimRefund(donor: Keypair, campaignId: bigint): Promise<bigint> {
  const result = await submitTransactionWithKeypair(donor, "claim_refund", [
    new Address(donor.publicKey()).toScVal(),
    nativeToScVal(campaignId, { type: "u64" }),
  ]);
  return BigInt(scValToNative((result as any).returnValue));
}

export { CONTRACT_ID, getCampaign, getEvents, Keypair, Operation, TransactionBuilder };
