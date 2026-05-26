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
import { signTransaction } from "@stellar/freighter-api";

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
  const parts = amount.toString().split(".");
  let stroops = BigInt(parts[0]) * BigInt(10 ** STROOP_PRECISION);
  if (parts.length > 1) {
    let decimals = parts[1];
    if (decimals.length > STROOP_PRECISION) {
      decimals = decimals.substring(0, STROOP_PRECISION);
    } else {
      decimals = decimals.padEnd(STROOP_PRECISION, "0");
    }
    stroops += BigInt(decimals);
  }
  return stroops;
}

export function fromStroops(stroops: bigint | string | number): string {
  const s = BigInt(stroops).toString().padStart(STROOP_PRECISION + 1, "0");
  const pos = s.length - STROOP_PRECISION;
  const intPart = s.substring(0, pos);
  const decPart = s.substring(pos).replace(/0+$/, "");
  return decPart.length > 0 ? `${intPart}.${decPart}` : intPart || "0";
}

export type CampaignStatus = "Active" | "Funded" | "Claimed" | "Expired";

export interface Campaign {
  id: bigint;
  creator: string;
  beneficiary: string;
  title: string;
  target_amount: bigint;
  raised_amount: bigint;
  deadline: bigint;
  accepted_token: string;
  status: CampaignStatus;
}

function parseCampaign(native: any): Campaign {
  return {
    id: BigInt(native.id),
    creator: native.creator,
    beneficiary: native.beneficiary,
    title: native.title.toString(),
    target_amount: BigInt(native.target_amount),
    raised_amount: BigInt(native.raised_amount),
    deadline: BigInt(native.deadline),
    accepted_token: native.accepted_token,
    status: Object.keys(native.status)[0] as CampaignStatus,
  };
}

export async function getCampaign(id: bigint): Promise<Campaign> {
  const tx = new TransactionBuilder(
    new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0"),
    {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    }
  )
    .addOperation(
      Operation.invokeHostFunction({
        func: "get_campaign",
        contractId: CONTRACT_ID,
        args: [nativeToScVal(id, { type: "u64" })],
      } as any)
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

export interface SubmitOptions {
  /** Called when simulation fee exceeds MAX_SIMULATION_FEE_STROOPS. */
  onHighGasWarning?: (feeStroops: number) => void;
}

export async function submitTransaction(
  sender: string,
  func: string,
  args: any[],
  options: SubmitOptions = {}
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
      })
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
  const result = await signTransaction(preparedTx.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  if ("error" in result) {
    throw new Error(`Wallet error: ${result.error}`);
  }

  const sendResponse = await server.sendTransaction(
    TransactionBuilder.fromXDR(result.signedTxXdr, NETWORK_PASSPHRASE) as any
  );

  if (sendResponse.status === "ERROR") {
    throw new Error(`Send failed: ${JSON.stringify(sendResponse.errorResultXdr)}`);
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
      topic: topics[1], // e.g., 'created', 'received', 'claimed'
      data: value,
    };
  });
}
