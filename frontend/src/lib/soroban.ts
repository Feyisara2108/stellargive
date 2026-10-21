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
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "./network";
import { CONTRACT_ID, RPC_URL } from "./config";
import { MAX_SIMULATION_FEE_STROOPS, STROOP_PRECISION, fromStroops, toStroops } from "./amounts";
import { isValidAccountAddress } from "./strkey";
import { logger } from "./logger";
import {
  isNativeCampaign,
  isNativeCampaignUpdate,
  type NativeCampaign,
} from "./bindings/stellarGive";
// NOTE: the wallet layer (./wallet — Freighter, Albedo, …) is browser-only, so it
// is imported lazily inside submitTransaction. This keeps the read-only
// helpers (getCampaign, getEvents…) safe to import on the server — e.g. from a
// route's generateMetadata.

export {
  CONTRACT_ID,
  RPC_URL,
  MAX_SIMULATION_FEE_STROOPS,
  STROOP_PRECISION,
  fromStroops,
  toStroops,
};
export {
  NETWORK_PASSPHRASE,
  getNetworkDisplayName,
  getWrongNetworkMessage,
  WRONG_NETWORK_MESSAGE,
} from "./network";

export const server = new rpc.Server(RPC_URL, { allowHttp: true });

/**
 * Smallest donation the contract accepts, in the token's base units. Mirrors
 * `MIN_DONATION` in contracts/stellar-give/src/lib.rs (0.1 XLM for 7-decimal
 * tokens); anything below fails on-chain with `InvalidAmount`.
 */
export const MIN_DONATION = 1_000_000n;

/** Network base reserve (0.5 XLM) — each account entry locks this much XLM. */
export const BASE_RESERVE_STROOPS = 5_000_000n;

/**
 * Fee held back from a native XLM balance when the simulated resource fee is
 * not yet known. Covers a typical `donate` resource fee plus inclusion fee.
 */
export const DEFAULT_DONATE_FEE_STROOPS = 1_000_000n;

/** Inclusion fee headroom added on top of a simulated resource fee. */
export const INCLUSION_FEE_BUFFER_STROOPS = 100_000n;

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
  /** Cumulative per-donor cap in base units; `null`/absent means uncapped. */
  max_per_donor?: bigint | null;
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

function parseCampaign(native: NativeCampaign): Campaign {
  const bens = native.beneficiaries.map(([address, share]) => ({ address, share }));
  return {
    id: native.id,
    creator: native.creator,
    beneficiary: bens[0]?.address || "",
    beneficiaries: bens,
    title: native.title,
    description: native.description,
    category:
      typeof native.category === "symbol"
        ? (native.category.description ?? "relief")
        : String(native.category ?? "relief").replace(/^Symbol\((.*)\)$/, "$1"),
    target_amount: native.target_amount,
    raised_amount: native.raised_amount,
    deadline: native.deadline,
    accepted_token: native.accepted_token,
    status: native.status,
    website: native.website?.toString(),
    twitter: native.twitter?.toString(),
    max_per_donor:
      native.max_per_donor != null
        ? BigInt(native.max_per_donor as string | number | bigint | boolean)
        : null,
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
  if (!isNativeCampaign(result)) throw new Error("Invalid campaign result");
  return parseCampaign(result);
}

/** Up to `limit` campaigns in contract order, starting `offset` campaigns in. */
export async function getRecentCampaigns(limit = 20, offset = 0): Promise<Campaign[]> {
  const campaigns: Campaign[] = [];
  let currentOffset = BigInt(offset);
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
      if (!Array.isArray(result) || !result.every(isNativeCampaign)) {
        throw new Error("Invalid campaign batch result");
      }
      const batch = result.map(parseCampaign);

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

/** Loads all campaigns created by `creator`, regardless of their age. */
export async function getCampaignsByCreator(creator: string): Promise<Campaign[]> {
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
        function: "get_campaigns_by_creator",
        args: [new Address(creator).toScVal()],
      }),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error("Failed to get creator campaigns: no result");
  const result = scValToNative(sim.result.retval);
  if (!Array.isArray(result) || !result.every(isNativeCampaign)) {
    throw new Error("Invalid creator campaigns result");
  }
  return result.map(parseCampaign);
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

export interface CampaignsPage {
  campaigns: Campaign[];
  hasMore: boolean;
  /** Offset to pass for the following page. */
  nextOffset: number;
}

/**
 * One page of campaigns starting at `offset`. Only that page is read from the
 * contract, so loading page N costs the same as loading page 1.
 */
export async function getCampaignsPage(offset: number, limit: number): Promise<CampaignsPage> {
  // Fetch one extra to detect whether more campaigns exist beyond this page.
  const batch = await getRecentCampaigns(limit + 1, offset);
  const campaigns = batch.slice(0, limit);
  return { campaigns, hasMore: batch.length > limit, nextOffset: offset + campaigns.length };
}

/**
 * Loads specific campaigns by id (e.g. bookmarks). Campaigns the contract no
 * longer knows about are skipped; any other failure is rethrown.
 */
export async function getCampaignsByIds(ids: readonly bigint[]): Promise<Campaign[]> {
  const results = await Promise.allSettled(ids.map((id) => getCampaign(id)));
  const campaigns: Campaign[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") campaigns.push(result.value);
    else if (!isCampaignNotFoundError(result.reason)) throw result.reason;
  }
  return campaigns;
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
    return Number(sim.minResourceFee ?? 0);
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
    logger.error("[soroban] simulation failed:", sim.error);
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const minFee = Number(sim.minResourceFee ?? 0);
  if (minFee > MAX_SIMULATION_FEE_STROOPS) {
    const msg = `High gas: simulated fee ${minFee} stroops exceeds threshold ${MAX_SIMULATION_FEE_STROOPS}`;
    logger.warn(`[soroban] ${msg}`);
    if (options.onHighGasWarning) {
      options.onHighGasWarning(minFee);
    }
  }
}

async function sendAndConfirm(signedXdr: string): Promise<SubmitTransactionResult> {
  const parsedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sendResponse = await server.sendTransaction(parsedTx);

  if (sendResponse.status === "ERROR") {
    const errorXdr = "errorResultXdr" in sendResponse ? sendResponse.errorResultXdr : undefined;
    const errorResult = "errorResult" in sendResponse ? sendResponse.errorResult : undefined;
    throw new Error(`Send failed: ${JSON.stringify(errorXdr || errorResult)}`);
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
const MAX_EVENTS_PER_RPC_PAGE = 1_000;

export async function getEvents(limit = 20) {
  const requested = Math.max(0, Math.floor(limit));
  if (requested === 0) return [];

  const filters = contractEventFilters();
  const pageSize = Math.min(requested, MAX_EVENTS_PER_RPC_PAGE);
  let response = await requestEventsFromAvailableLedger(filters, pageSize);
  const raw = [...response.events];
  let pages = 1;

  while (
    raw.length < requested &&
    response.events.length === pageSize &&
    pages < EVENT_HISTORY_MAX_PAGES
  ) {
    response = await server.getEvents({
      cursor: response.cursor,
      filters,
      limit: Math.min(pageSize, requested - raw.length),
    });
    raw.push(...response.events);
    pages++;
  }

  return dedupeClaimEvents(raw.slice(0, requested).map(decodeEvent));
}

async function getOldestAvailableLedger(): Promise<number> {
  let healthError: unknown;
  try {
    const { oldestLedger } = await server.getHealth();
    if (Number.isSafeInteger(oldestLedger) && oldestLedger > 0) return oldestLedger;
  } catch (error) {
    healthError = error;
  }

  try {
    const latest = await server.getLatestLedger();
    return Math.max(1, latest.sequence - EVENT_LOOKBACK_LEDGERS);
  } catch (latestError) {
    if (healthError !== undefined) {
      throw new Error("Unable to determine the oldest available event ledger.", {
        cause: new AggregateError([healthError, latestError]),
      });
    }
    throw latestError;
  }
}

function isUnavailableLedgerRange(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);
  return (
    /start.?ledger/i.test(message) &&
    /(range|retention|available|oldest|invalid|must|greater|less)/i.test(message)
  );
}

async function requestEventsFromAvailableLedger(
  filters: rpc.Api.EventFilter[],
  limit: number,
): Promise<Awaited<ReturnType<typeof server.getEvents>>> {
  const startLedger = await getOldestAvailableLedger();
  try {
    return await server.getEvents({ startLedger, filters, limit });
  } catch (error) {
    if (!isUnavailableLedgerRange(error)) throw error;
    const refreshedStart = await getOldestAvailableLedger();
    const latest = await server.getLatestLedger();
    return server.getEvents({
      startLedger: Math.max(
        startLedger + 1,
        refreshedStart,
        latest.sequence - EVENT_LOOKBACK_LEDGERS,
      ),
      filters,
      limit,
    });
  }
}

/** Events per `getEvents` page in a full-history scan (the RPC caps `limit` at 10,000). */
export const EVENT_HISTORY_PAGE_SIZE = 1_000;
/**
 * Upper bound on pages per history scan, so an unexpectedly busy contract can't
 * stall the page. 20 × 1,000 events comfortably covers a week of RPC retention
 * for this contract; when it doesn't, `truncated` is set and the UI says so.
 */
export const EVENT_HISTORY_MAX_PAGES = 20;

export interface EventHistory {
  events: SorobanEvent[];
  /** Ledger close time (ISO) of the oldest ledger scanned, i.e. where the numbers start. */
  windowStart: string | null;
  /** Close time (ISO) of the last ledger the numbers cover. */
  windowEnd: string | null;
  /** True when the page cap was hit before the scan reached the ledger tip. */
  truncated: boolean;
}

/**
 * Every contract event the RPC still retains, paged with the RPC cursor rather
 * than capped at a single `limit`. Soroban RPC only keeps a rolling window of
 * events (about a week by default), so the result also reports the period it
 * covers; aggregates built from it are "since `windowStart`", never all-time.
 */
export async function getEventHistory(
  maxPages = EVENT_HISTORY_MAX_PAGES,
  pageSize = EVENT_HISTORY_PAGE_SIZE,
): Promise<EventHistory> {
  const filters = contractEventFilters();

  let response = await requestEventsFromAvailableLedger(filters, pageSize);
  const windowStart = response.oldestLedgerCloseTime || null;
  const raw = [...response.events];
  let pages = 1;
  while (response.events.length === pageSize && pages < maxPages) {
    response = await server.getEvents({ cursor: response.cursor, filters, limit: pageSize });
    raw.push(...response.events);
    pages++;
  }

  const truncated = response.events.length === pageSize;
  const events = dedupeClaimEvents(raw.map(decodeEvent));
  return {
    events,
    windowStart,
    windowEnd: truncated
      ? (events[events.length - 1]?.createdAt ?? null)
      : response.latestLedgerCloseTime || null,
    truncated,
  };
}

function contractEventFilters(): rpc.Api.EventFilter[] {
  return [{ type: "contract", contractIds: [CONTRACT_ID] }];
}

function decodeEvent(event: rpc.Api.EventResponse): SorobanEvent {
  const topics = event.topic.map((t) => scValToNative(t));
  return {
    id: event.id,
    txHash: "txHash" in event && typeof event.txHash === "string" ? event.txHash : event.id,
    ledger: event.ledger,
    createdAt: event.ledgerClosedAt,
    topic: eventTopicLabel(topics),
    data: scValToNative(event.value),
  };
}

/**
 * UI label for an event's topics. Dual-symbol events (e.g. donation/received,
 * funds/claimed) put the label in topics[1]; events whose second topic is a
 * campaign id (e.g. `(claimed, id)`, `(refund, id)`) and single-topic events
 * (e.g. created) use topics[0].
 */
export function eventTopicLabel(topics: unknown[]): string {
  if (typeof topics[1] === "string") return topics[1];
  return typeof topics[0] === "string" ? topics[0] : String(topics[0] ?? "");
}

/**
 * `claim` publishes both a `(funds, claimed)` tuple and a `(claimed, id)`
 * struct in the same transaction; both label as `claimed`. Keep the first per
 * transaction so each claim is shown (and counted) once.
 */
export function dedupeClaimEvents<T extends { topic: string; txHash: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (event.topic !== "claimed") return true;
    if (seen.has(event.txHash)) return false;
    seen.add(event.txHash);
    return true;
  });
}

export interface TopDonor {
  /** Donor address; anonymous donations are aggregated under the zero address. */
  address: string;
  amount: bigint;
}

/** Returns the contract's top-5 donor leaderboard for a campaign, highest first. */
export async function getTopDonors(campaignId: bigint): Promise<TopDonor[]> {
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
        function: "get_top_donors",
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
  return rawList.map((entry: unknown) => {
    const pair = Array.isArray(entry) ? entry : [];
    return {
      address: String(pair[0] ?? ""),
      amount: BigInt((pair[1] ?? 0) as string | number | bigint),
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
  if (!Array.isArray(result) || !result.every(isNativeCampaignUpdate)) {
    throw new Error("Invalid updates result");
  }
  return result.map((u) => ({
    content: u.content,
    timestamp: u.timestamp,
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

/**
 * Minimum XLM an account must keep: (2 + subentries + sponsoring - sponsored)
 * base reserves, plus XLM locked as selling liabilities by open offers.
 */
export function computeMinimumReserve(entry: {
  numSubEntries: number;
  numSponsoring?: number;
  numSponsored?: number;
  sellingLiabilities?: bigint;
}): bigint {
  const entries =
    2n +
    BigInt(entry.numSubEntries) +
    BigInt(entry.numSponsoring ?? 0) -
    BigInt(entry.numSponsored ?? 0);
  return entries * BASE_RESERVE_STROOPS + (entry.sellingLiabilities ?? 0n);
}

/**
 * Reads the account's ledger entry and returns the XLM (in stroops) it cannot
 * spend. Falls back to the two-entry base minimum if the entry can't be read.
 */
export async function getAccountMinimumReserve(address: string): Promise<bigint> {
  try {
    const key = xdr.LedgerKey.account(
      new xdr.LedgerKeyAccount({ accountId: Keypair.fromPublicKey(address).xdrPublicKey() }),
    );
    const res = await server.getLedgerEntries(key);
    const data = res.entries[0]?.val;
    if (data?.type !== "account") return computeMinimumReserve({ numSubEntries: 0 });
    const account = data.account;

    let numSponsoring = 0;
    let numSponsored = 0;
    let sellingLiabilities = 0n;
    if (account.ext.type === "v1") {
      const v1 = account.ext.v1;
      sellingLiabilities = v1.liabilities.selling;
      if (v1.ext.type === "v2") {
        numSponsoring = v1.ext.v2.numSponsoring;
        numSponsored = v1.ext.v2.numSponsored;
      }
    }
    return computeMinimumReserve({
      numSubEntries: account.numSubEntries,
      numSponsoring,
      numSponsored,
      sellingLiabilities,
    });
  } catch {
    return computeMinimumReserve({ numSubEntries: 0 });
  }
}

/**
 * Total the donor has already given to a campaign, read straight from the
 * contract's persistent `("DCON", campaign_id, donor)` entry. Returns 0 when
 * the donor has never given.
 */
export async function getDonorContribution(campaignId: bigint, donor: string): Promise<bigint> {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(CONTRACT_ID).toScAddress(),
      key: xdr.ScVal.scvVec([
        nativeToScVal("DCON", { type: "symbol" }),
        nativeToScVal(campaignId, { type: "u64" }),
        new Address(donor).toScVal(),
      ]),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
  const res = await server.getLedgerEntries(key);
  const data = res.entries[0]?.val;
  if (data?.type !== "contractData") return 0n;
  return BigInt(scValToNative(data.contractData.val));
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
  return isValidAccountAddress(address);
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
