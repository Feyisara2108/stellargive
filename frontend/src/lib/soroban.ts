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
// NOTE: @stellar/freighter-api is browser-only, so it is imported lazily inside
// submitTransaction. This keeps the read-only helpers (getCampaign, getEvents…)
// safe to import on the server — e.g. from a route's generateMetadata.

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID!;
export const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL!;
export const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!;

export const server = new rpc.Server(RPC_URL);

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

export type CampaignStatus = "Active" | "Funded" | "Claimed" | "Expired";

export interface Campaign {
  id: bigint;
  creator: string;
  beneficiary: string;
  title: string;
  category: string;
  target_amount: bigint;
  raised_amount: bigint;
  deadline: bigint;
  accepted_token: string;
  status: CampaignStatus;
  website?: string;
  twitter?: string;
}

function parseCampaign(native: any): Campaign {
  return {
    id: BigInt(native.id),
    creator: native.creator,
    beneficiary: native.beneficiary,
    title: native.title.toString(),
    category: native.category.toString(),
    target_amount: BigInt(native.target_amount),
    raised_amount: BigInt(native.raised_amount),
    deadline: BigInt(native.deadline),
    accepted_token: native.accepted_token,
    status: Object.keys(native.status)[0] as CampaignStatus,
    website: native.website?.toString(),
    twitter: native.twitter?.toString(),
  };
}

export async function getCampaign(id: bigint): Promise<Campaign> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    },
  )
    .addOperation(
      Operation.invokeHostFunction({
        func: "get_campaign",
        contractId: CONTRACT_ID,
        args: [nativeToScVal(id, { type: "u64" })],
      } as any),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error("Failed to get campaign: no result");
  const result = scValToNative(sim.result.retval);
  return parseCampaign(result);
}

export async function getRecentCampaigns(limit = 10): Promise<Campaign[]> {
  const campaigns: Campaign[] = [];
  for (let i = 1n; i <= BigInt(limit); i++) {
    try {
      const c = await getCampaign(i);
      campaigns.push(c);
    } catch (e) {
      break;
    }
  }
  return campaigns;
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
  args: any[],
): Promise<number | null> {
  try {
    const account = await server.getAccount(sender);
    const tx = new TransactionBuilder(account, {
      fee: "1000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.invokeHostFunction({
          func,
          contractId: CONTRACT_ID,
          args,
        } as any),
      )
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return null;
    return Number(
      (sim as rpc.Api.SimulateTransactionSuccessResponse).minResourceFee ?? 0,
    );
  } catch {
    return null;
  }
}

export interface SubmitOptions {
  /** Called when simulation fee exceeds MAX_SIMULATION_FEE_STROOPS. */
  onHighGasWarning?: (feeStroops: number) => void;
}

export async function submitTransaction(
  sender: string,
  func: string,
  args: any[],
  options: SubmitOptions = {},
) {
  const account = await server.getAccount(sender);
  const tx = new TransactionBuilder(account, {
    fee: "1000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func,
        contractId: CONTRACT_ID,
        args,
      } as any),
    )
    .setTimeout(30)
    .build();

  // Simulate first to check resource fee before asking the user to sign.
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

  const preparedTx = await server.prepareTransaction(tx);
  const { signTransaction } = await import("@stellar/freighter-api");
  const result = await signTransaction(preparedTx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  if ("error" in result) {
    throw new Error(`Wallet error: ${result.error}`);
  }

  const sendResponse = await server.sendTransaction(
    TransactionBuilder.fromXDR(result.signedTxXdr, NETWORK_PASSPHRASE) as any,
  );

  if (sendResponse.status === "ERROR") {
    throw new Error(
      `Send failed: ${JSON.stringify((sendResponse as any).errorResultXdr || sendResponse.errorResult)}`,
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
    (txResult as any).hash = sendResponse.hash;
    return txResult;
  } else {
    throw new Error(`Transaction failed: ${txResult.status}`);
  }
}

export async function getEvents(limit = 20) {
  const response = await server.getEvents({
    startLedger: 0,
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
    return {
      id: event.id,
      ledger: event.ledger,
      createdAt: event.ledgerClosedAt,
      topic: topics[1], // e.g., 'created', 'received', 'claimed'
      data: value,
    };
  });
}

export interface CampaignUpdate {
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
      Operation.invokeHostFunction({
        func: "get_updates",
        contractId: CONTRACT_ID,
        args: [nativeToScVal(campaignId, { type: "u64" })],
      } as any),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) return [];
  const result = scValToNative(sim.result.retval);
  return (result as any[]).map((u) => ({
    content: u.content.toString(),
    timestamp: BigInt(u.timestamp),
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
      Operation.invokeHostFunction({
        func: "balance",
        contractId: contractId,
        args: [new Address(userAddress).toScVal()],
      } as any),
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
      Operation.invokeHostFunction({
        func: "symbol",
        contractId,
        args: [],
      } as any),
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
      Operation.invokeHostFunction({
        func: "decimals",
        contractId,
        args: [],
      } as any),
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
