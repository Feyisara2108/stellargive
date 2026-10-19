import {
  rpc,
  TransactionBuilder,
  Account,
  xdr,
  ScInt,
  Address,
  nativeToScVal,
  scValToNative,
  Networks,
  Keypair,
  Operation,
  StrKey,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "./network";
// NOTE: the wallet layer (./wallet — Freighter, Albedo, …) is browser-only, so it
// is imported lazily inside submitTransaction. This keeps the read-only
// helpers (getCampaign, getEvents…) safe to import on the server — e.g. from a
// route's generateMetadata.

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID || "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
export const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "http://localhost:8000/rpc";
export {
  NETWORK_PASSPHRASE,
  getNetworkDisplayName,
  getWrongNetworkMessage,
  WRONG_NETWORK_MESSAGE,
} from "./network";

export const server = new rpc.Server(RPC_URL, { allowHttp: true });

export const STROOP_PRECISION = 7;

/**
 * Maximum resource fee (in stroops) we expect any single contract call to
 * consume.  Transactions simulating above this threshold are flagged so the UI
 * can warn the user before they sign.  The hard cap set here is deliberately
 * generous (10 M CPU units worth of fee headroom); tighten per-call if needed.
 */
export const MAX_SIMULATION_FEE_STROOPS = 10_000_000;

export function toStroops(amount: string | number): bigint {
  const str = amount.toString().trim();

  // Reject non-numeric inputs
  if (!/^\d+(\.\d+)?$/.test(str)) {
    if (str.startsWith("-")) {
      throw new Error("Invalid amount: negative values not allowed");
    }
    throw new Error("Invalid amount: not a number");
  }

  const parts = str.split(".");

  // Reject excessive decimal places (more than 7)
  if (parts.length > 1 && parts[1].length > STROOP_PRECISION) {
    throw new Error(`Invalid amount: exceeds ${STROOP_PRECISION} decimal places`);
  }

  let stroops = BigInt(parts[0]) * BigInt(10 ** STROOP_PRECISION);
  if (parts.length > 1) {
    const decimals = parts[1].padEnd(STROOP_PRECISION, "0");
    stroops += BigInt(decimals);
  }
  return stroops;
}

export function fromStroops(stroops: bigint | string | number): string {
  const n = BigInt(stroops);
  const intPart = (n / 10_000_000n).toString();
  const decRaw = (n % 10_000_000n).toString().padStart(7, "0");
  const decPart = decRaw.replace(/0+$/, "");
  return decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
}

export type CampaignStatus = "Active" | "Funded" | "Claimed" | "Expired" | "Cancelled";

export interface CampaignBeneficiary {
  address: string;
  share: number; // basis points (10000 = 100%)
}

export interface Campaign {
  id: bigint;
  creator: string;
  beneficiary: string;
  beneficiaries: CampaignBeneficiary[];
  title: string;
  description: string;
  category: string;
  target_amount: bigint;
  raised_amount: bigint;
  deadline: bigint;
  accepted_token: string;
  status: CampaignStatus;
  metadata_uri?: string;
  website?: string;
  twitter?: string;
  /** Client-side free-form tags for search/filtering — not stored on-chain. */
  tags?: string[];
}

export type SubmitTransactionResult = rpc.Api.GetSuccessfulTransactionResponse & { hash: string };

export interface SorobanEvent {
  id: string;
  txHash: string;
  ledger: number;
  createdAt: string;
  topic: string;
  data: unknown;
  timestamp?: string | number;
}

function parseCampaign(native: Record<string, unknown>): Campaign {
  const rawBens = Array.isArray(native.beneficiaries) ? native.beneficiaries : [];
  const bens = rawBens.map((b: unknown) => {
    const pair = Array.isArray(b) ? b : [];
    return {
      address: String(pair[0] ?? ""),
      share: Number(pair[1] ?? 0),
    };
  });
  return {
    id: BigInt(native.id as string | number | bigint | boolean),
    creator: String(native.creator ?? ""),
    beneficiary: bens[0]?.address || (native.beneficiary ? String(native.beneficiary) : ""),
    beneficiaries: bens,
    title: String(native.title ?? ""),
    description: String(native.description ?? ""),
    category:
      typeof native.category === "symbol"
        ? (native.category.description ?? "relief")
        : String(native.category ?? "relief").replace(/^Symbol\((.*)\)$/, "$1"),
    target_amount: BigInt(native.target_amount as string | number | bigint | boolean),
    raised_amount: BigInt(native.raised_amount as string | number | bigint | boolean),
    deadline: BigInt(native.deadline as string | number | bigint | boolean),
    accepted_token: String(native.accepted_token ?? ""),
    status: (Object.keys((native.status as object) || {})[0] ??
      (typeof native.status === "object" && native.status
        ? Object.getOwnPropertySymbols(native.status)[0]?.description
        : undefined) ??
      "Active") as CampaignStatus,
    website: native.website?.toString(),
    twitter: native.twitter?.toString(),
  };
}

/** `ContractError::CampaignNotFound` in contracts/stellar-give/src/lib.rs. */
export const CAMPAIGN_NOT_FOUND_ERROR_CODE = 4;

/**
 * Thrown by getCampaign only when the contract itself reports the campaign
 * doesn't exist, so callers can tell "deleted / never existed" apart from an
 * RPC or network failure.
 */
export class CampaignNotFoundError extends Error {
  constructor(id: bigint) {
    super(`Campaign ${id} not found`);
    this.name = "CampaignNotFoundError";
  }
}

export function isCampaignNotFoundError(e: unknown): e is CampaignNotFoundError {
  return e instanceof CampaignNotFoundError;
}

// Simulation errors carry the contract error as e.g. "HostError: Error(Contract, #4)".
const CAMPAIGN_NOT_FOUND_PATTERN = new RegExp(
  `Error\\(Contract, #${CAMPAIGN_NOT_FOUND_ERROR_CODE}\\)`,
);

export async function getCampaign(id: bigint): Promise<Campaign> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "get_campaign",
        args: [nativeToScVal(id, { type: "u64" })],
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    if (CAMPAIGN_NOT_FOUND_PATTERN.test(sim.error)) {
      throw new CampaignNotFoundError(id);
    }
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error("Failed to get campaign: no result");
  const result = scValToNative(sim.result.retval);
  return parseCampaign(result);
}

export async function getRecentCampaigns(limit = 20): Promise<Campaign[]> {
  const campaigns: Campaign[] = [];
  let currentOffset = 0n;
  const batchSize = 20;

  while (campaigns.length < limit) {
    const fetchLimit = Math.min(batchSize, limit - campaigns.length);

    const tx = new TransactionBuilder(
      new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
      {
        fee: "100",
        networkPassphrase: NETWORK_PASSPHRASE,
      },
    )
      .addOperation(
        Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: "get_campaigns_paged",
          args: [
            nativeToScVal(currentOffset, { type: "u64" }),
            nativeToScVal(fetchLimit, { type: "u32" }),
          ],
        }),
      )
      .setTimeout(30)
      .build();

    try {
      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        if (campaigns.length === 0) {
          throw new Error(`Simulation failed: ${sim.error}`);
        }
        break;
      }
      if (!sim.result) {
        if (campaigns.length === 0) {
          throw new Error("Failed to get campaigns: no result");
        }
        break;
      }

      const result = scValToNative(sim.result.retval);
      const batch = (result as Record<string, unknown>[]).map(parseCampaign);

      if (batch.length === 0) {
        break;
      }

      campaigns.push(...batch);
      currentOffset += BigInt(batch.length);

      if (batch.length < fetchLimit) {
        break;
      }
    } catch (e) {
      if (campaigns.length === 0) {
        throw e;
      }
      break;
    }
  }

  return campaigns;
}

async function fetchTotalCampaigns(): Promise<bigint> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "get_total_campaigns",
        args: [],
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error("Failed to get total campaigns: no result");
  const result = scValToNative(sim.result.retval);
  return BigInt(result);
}

/**
 * Public-facing total campaign count (e.g. the homepage stats strip). Swallows
 * RPC/simulation failures to 0 rather than surfacing an error, since a
 * transient hiccup shouldn't break that read-only display.
 */
export async function getTotalCampaigns(): Promise<bigint> {
  try {
    return await fetchTotalCampaigns();
  } catch {
    return 0n;
  }
}

export async function getOwner(): Promise<string> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "get_owner",
        args: [],
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error("Failed to get owner: no result");
  const result = scValToNative(sim.result.retval);
  return String(result);
}

/**
 * Fee basis points the contract charges on every successful claim, out of
 * `PLATFORM_FEE_DENOMINATOR`. The contract has no getter for this — it's a
 * compile-time constant (`FEE_BPS` / `FEE_DENOMINATOR` in lib.rs) — so this
 * mirrors the deployed value rather than being fetched.
 */
export const PLATFORM_FEE_BPS = 100;
export const PLATFORM_FEE_DENOMINATOR = 10_000;

export interface PlatformConfig {
  owner: string;
  totalCampaigns: bigint;
  feeBps: number;
  feeDenominator: number;
}

/**
 * Admin-facing platform configuration snapshot. Unlike `getTotalCampaigns`,
 * this throws on failure so the caller (the admin panel) can surface a real
 * error state per metric instead of silently showing a misleading 0.
 */
export async function getPlatformConfig(): Promise<PlatformConfig> {
  const [owner, totalCampaigns] = await Promise.all([getOwner(), fetchTotalCampaigns()]);
  return {
    owner,
    totalCampaigns,
    feeBps: PLATFORM_FEE_BPS,
    feeDenominator: PLATFORM_FEE_DENOMINATOR,
  };
}

export async function getCampaignsPage(
  limit: number,
): Promise<{ campaigns: Campaign[]; hasMore: boolean }> {
  // Fetch one extra to detect whether more campaigns exist beyond `limit`.
  const all = await getRecentCampaigns(limit + 1);
  const hasMore = all.length > limit;
  return { campaigns: all.slice(0, limit), hasMore };
}

export async function estimateFee(
  sender: string,
  func: string,
  args: xdr.ScVal[],
): Promise<number | null> {
  try {
    const account = await server.getAccount(sender);
    const tx = new TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: func,
          args,
        }),
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return null;
    return Number((sim as rpc.Api.SimulateTransactionSuccessResponse).minResourceFee ?? 0);
  } catch {
    return null;
  }
}

export interface SubmitOptions {
  /** Called when simulation fee exceeds MAX_SIMULATION_FEE_STROOPS. */
  onHighGasWarning?: (feeStroops: number) => void;
}

async function prepareInvokeTransaction(sender: string, func: string, args: xdr.ScVal[]) {
  const account = await server.getAccount(sender);
  return new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: func,
        args,
      }),
    )
    .setTimeout(30)
    .build();
}

async function simulateAndWarn(
  tx: ReturnType<TransactionBuilder["build"]>,
  options: SubmitOptions,
) {
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    console.error("[soroban] simulation failed:", sim.error);
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const minFee = Number((sim as rpc.Api.SimulateTransactionSuccessResponse).minResourceFee ?? 0);
  if (minFee > MAX_SIMULATION_FEE_STROOPS) {
    const msg = `High gas: simulated fee ${minFee} stroops exceeds threshold ${MAX_SIMULATION_FEE_STROOPS}`;
    console.warn(`[soroban] ⚠️ ${msg}`);
    if (options.onHighGasWarning) {
      options.onHighGasWarning(minFee);
    }
  }
}

async function sendAndConfirm(signedXdr: string): Promise<SubmitTransactionResult> {
  const parsedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sendResponse = await server.sendTransaction(
    parsedTx as Parameters<typeof server.sendTransaction>[0],
  );

  if (sendResponse.status === "ERROR") {
    const errorXdr = "errorResultXdr" in sendResponse ? sendResponse.errorResultXdr : undefined;
    const errorResult = "errorResult" in sendResponse ? sendResponse.errorResult : undefined;
    throw new Error(
      `Send failed: ${JSON.stringify(errorXdr || errorResult)}`,
    );
  }

  let txResult = await server.getTransaction(sendResponse.hash);
  while (
    txResult.status === rpc.Api.GetTransactionStatus.NOT_FOUND ||
    (txResult.status === rpc.Api.GetTransactionStatus.SUCCESS && !txResult.resultMetaXdr)
  ) {
    await new Promise((r) => setTimeout(r, 1000));
    txResult = await server.getTransaction(sendResponse.hash);
  }

  if (txResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return Object.assign(txResult, { hash: sendResponse.hash });
  }
  throw new Error(`Transaction failed: ${txResult.status}`);
}

export async function submitTransaction(
  sender: string,
  func: string,
  args: xdr.ScVal[],
  options: SubmitOptions = {},
): Promise<SubmitTransactionResult> {
  const tx = await prepareInvokeTransaction(sender, func, args);
  await simulateAndWarn(tx, options);

  const preparedTx = await server.prepareTransaction(tx);
  const { signTransaction } = await import("./wallet");
  const signedTxXdr = await signTransaction(preparedTx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: sender,
  });

  return sendAndConfirm(signedTxXdr);
}

/**
 * Same invoke path as `submitTransaction`, but signs with a Keypair.
 * Used by local-network integration tests (no browser wallet).
 */
export async function submitTransactionWithKeypair(
  keypair: Keypair,
  func: string,
  args: xdr.ScVal[],
  options: SubmitOptions = {},
): Promise<SubmitTransactionResult> {
  const tx = await prepareInvokeTransaction(keypair.publicKey(), func, args);
  await simulateAndWarn(tx, options);

  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(keypair);
  return sendAndConfirm(preparedTx.toXDR());
}

/** How far back from the tip to scan for contract events (ledgers ≈ 5s each). */
const EVENT_LOOKBACK_LEDGERS = 10_000;

export async function getEvents(limit = 20) {
  // Real Soroban RPC rejects `startLedger: 0`. Anchor near the tip instead.
  let startLedger = 1;
  try {
    const latest = await server.getLatestLedger();
    startLedger = Math.max(1, latest.sequence - EVENT_LOOKBACK_LEDGERS);
  } catch {
    // Fall through with startLedger = 1 if the tip cannot be read.
  }

  const response = await server.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [CONTRACT_ID],
      },
    ],
    limit,
  });

  return response.events.map((event) => {
    const topics = event.topic.map((t) => scValToNative(t));
    const value = scValToNative(event.value);
    // Dual-topic events (e.g. donation/received) put the UI label in topics[1];
    // single-topic events (e.g. created) only have topics[0].
    const topic = (topics[1] ?? topics[0]) as string;
    return {
      id: event.id,
      txHash: ("txHash" in event && typeof event.txHash === "string" ? event.txHash : event.id),
      ledger: event.ledger,
      createdAt: event.ledgerClosedAt,
      topic,
      data: value,
    };
  });
}

export interface CampaignUpdate {
  id?: string;
  content: string;
  timestamp: bigint;
}

export async function getUpdates(campaignId: bigint): Promise<CampaignUpdate[]> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "get_updates",
        args: [nativeToScVal(campaignId, { type: "u64" })],
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) return [];
  const result = scValToNative(sim.result.retval);
  const rawList = Array.isArray(result) ? result : [];
  return rawList.map((u: Record<string, unknown>) => ({
    content: String(u.content ?? ""),
    timestamp: BigInt(u.timestamp as string | number | bigint),
  }));
}

export async function getSACBalance(contractId: string, userAddress: string): Promise<bigint> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "balance",
        args: [new Address(userAddress).toScVal()],
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error("Failed to get balance: no result");
  const result = scValToNative(sim.result.retval);
  return BigInt(result);
}

export interface TokenMetadata {
  symbol: string;
  decimals: number;
  name?: string;
}

export async function getTokenMetadata(contractId: string): Promise<TokenMetadata> {
  const txSymbol = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "symbol",
        args: [],
      }),
    )
    .setTimeout(30)
    .build();

  const simSymbol = await server.simulateTransaction(txSymbol);
  if (rpc.Api.isSimulationError(simSymbol) || !simSymbol.result) {
    throw new Error("Failed to fetch symbol or not a valid SAC/Token contract");
  }
  const symbol = scValToNative(simSymbol.result.retval).toString();

  const txDecimals = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: "decimals",
        args: [],
      }),
    )
    .setTimeout(30)
    .build();

  const simDecimals = await server.simulateTransaction(txDecimals);
  if (rpc.Api.isSimulationError(simDecimals) || !simDecimals.result) {
    throw new Error("Failed to fetch decimals or not a valid SAC/Token contract");
  }
  const decimals = Number(scValToNative(simDecimals.result.retval));

  return { symbol, decimals };
}

/**
 * Checksum-validates a Stellar public key (G... address). Unlike a shape-only
 * regex, this rejects addresses with an invalid checksum even when the
 * length and prefix look right.
 */
export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

/**
 * Attempt to resolve a domain name or directory label for the given Stellar address.
 * Uses standard Stellar directory lookups and account records.
 * Unresolved addresses gracefully return null without console errors.
 */
export async function resolveAddressName(address: string): Promise<string | null> {
  if (!address || !address.startsWith("G") || address.length !== 56) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      // 1. Standard StellarExpert Directory Lookup
      const dirResponse = await fetch(
        `https://api.stellar.expert/explorer/directory?address[]=${encodeURIComponent(address)}`,
        { method: "GET", signal: controller.signal },
      );

      if (dirResponse.ok) {
        const data = await dirResponse.json();
        const record = data?._embedded?.records?.[0];
        const displayName = record?.name || record?.domain || record?.title;
        if (displayName && typeof displayName === "string") {
          clearTimeout(timeoutId);
          return displayName;
        }
      }
    } catch {
      // Silent failure for directory lookup
    }

    try {
      // 2. Horizon Stellar Record Account Lookup (home_domain)
      const horizonResponse = await fetch(
        `https://horizon-testnet.stellar.org/accounts/${encodeURIComponent(address)}`,
        { method: "GET", signal: controller.signal },
      );

      if (horizonResponse.ok) {
        const data = await horizonResponse.json();
        if (data?.home_domain && typeof data.home_domain === "string") {
          clearTimeout(timeoutId);
          return data.home_domain;
        }
      }
    } catch {
      // Silent failure for Horizon lookup
    } finally {
      clearTimeout(timeoutId);
    }

    return null;
  } catch {
    return null;
  }
}
