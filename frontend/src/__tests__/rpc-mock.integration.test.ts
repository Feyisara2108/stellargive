import { describe, it, expect } from "vitest";
import { server, errorHandlers } from "@/mocks/setup";

describe("Soroban RPC Mock Integration", () => {
  it("should handle successful transaction simulation", async () => {
    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: ["transaction_envelope_xdr"],
      }),
    });

    const data = (await response.json()) as any;
    expect(data.jsonrpc).toBe("2.0");
    expect(data.result).toBeDefined();
    expect(data.result.transactionData).toBeDefined();
    expect(data.result.cost.cpuInsns).toBeDefined();
  });

  it("should handle successful transaction retrieval", async () => {
    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "getTransaction",
        params: ["transaction_hash"],
      }),
    });

    const data = (await response.json()) as any;
    expect(data.result).toBeDefined();
    expect(data.result.status).toBe("SUCCESS");
    expect(data.result.tx).toBeDefined();
  });

  it("should handle events retrieval", async () => {
    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "getEvents",
        params: [
          {
            startLedger: "100",
            limit: "10",
            filters: [],
          },
        ],
      }),
    });

    const data = (await response.json()) as any;
    expect(data.result).toBeDefined();
    expect(data.result.events).toBeInstanceOf(Array);
  });

  it("should handle latest ledger queries", async () => {
    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "getLatestLedger",
      }),
    });

    const data = (await response.json()) as any;
    expect(data.result).toBeDefined();
    expect(data.result.sequence).toBeDefined();
    expect(data.result.closedAt).toBeDefined();
  });

  it("should return error for unsupported methods", async () => {
    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "unsupportedMethod",
      }),
    });

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32601);
    expect(data.error.message).toBe("Method not found");
  });

  it("should handle transaction failure scenarios", async () => {
    server.use(...errorHandlers.transactionFailed);

    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 6,
        method: "simulateTransaction",
        params: ["transaction_envelope_xdr"],
      }),
    });

    const data = (await response.json()) as any;
    expect(data.error).toBeDefined();
    expect(data.error.message).toContain("error");
  });

  it("should handle node timeout scenarios", async () => {
    server.use(...errorHandlers.nodeTimeout);

    try {
      await fetch("/rpc", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "getTransaction",
          params: ["transaction_hash"],
        }),
      });
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it("should handle failed transaction responses", async () => {
    server.use(...errorHandlers.transactionFailed);

    const response = await fetch("/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 8,
        method: "getTransaction",
        params: ["transaction_hash"],
      }),
    });

    const data = (await response.json()) as any;
    expect(data.result.status).toBe("FAILED");
  });
});
