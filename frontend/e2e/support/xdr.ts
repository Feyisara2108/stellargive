import { scValToNative, xdr } from "@stellar/stellar-sdk";

/** The slice of a Soroban JSON-RPC request body that the e2e mocks read. */
export interface RpcRequestBody {
  method?: string;
  id?: number;
  params?: { transaction?: string };
}

/** Reads an XDR union arm or struct field, which stellar-sdk exposes as a method or a property. */
export function field(obj: unknown, key: string): unknown {
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "function" ? (value as () => unknown).call(obj) : value;
}

/** Decodes the contract function name and arguments from a base64 transaction envelope. */
export function decodeInvocation(txXdr: string): { fn: string; args: unknown[] } | null {
  try {
    const env = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
    const operations = field(field(field(env, "v1"), "tx"), "operations") as unknown[];
    const body = field(operations[0], "body");
    const hostFunction = field(field(body, "invokeHostFunctionOp"), "hostFunction");
    const ic = field(hostFunction, "invokeContract");
    return {
      fn: String(field(ic, "functionName")),
      args: (field(ic, "args") as xdr.ScVal[]).map((a) => scValToNative(a)),
    };
  } catch {
    return null;
  }
}
