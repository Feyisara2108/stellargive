import { http, HttpResponse } from "msw";

export const handlers = [
  http.post("/rpc", async ({ request }) => {
    const body = await request.json() as any;
    const method = body.method;

    if (method === "simulateTransaction") {
      return HttpResponse.json({
        id: body.id,
        jsonrpc: "2.0",
        result: {
          transactionData:
            "AAAAAgAAAABz0nVt8LLjOiO3SXePBhLcVDXIpx3EL0dFxKVpAzXYVAAAZABr3wAAAAAAAAAGAAAAAQAAAAAAAGQAAAAAAAAAAgAAAAAAAAAAAQAA/////wEAAAAGAAABKwAAAADcOcSKqJDqzVBSvjr7mYJqhPPtCVwfqkHzO0A=",
          minResourceFee: "52521",
          events: [],
          restorePreamble: [],
          supportedInstructionSchemas: [12, 13, 14, 15],
          cost: {
            cpuInsns: "1689904",
            memBytes: "1289276",
          },
        },
      });
    }

    if (method === "getTransaction") {
      return HttpResponse.json({
        id: body.id,
        jsonrpc: "2.0",
        result: {
          status: "SUCCESS",
          latestLedger: 123456,
          latestLedgerCloseTime: "1234567890",
          oldestLedger: 1,
          oldestLedgerCloseTime: "1000000000",
          tx: {
            hash: body.params?.[0] || "0x" + "a".repeat(64),
            ledger: 123000,
            createdAt: "2024-01-01T00:00:00Z",
            sourceAccount: {
              id: "GBRPYHIL2CI3WHZDTOOQFC6EB4CGQOFN4L5MHZ5RWBNRUbalxas5F3B2",
              sequenceNumber: "1000",
            },
            feeBump: null,
            operations: [
              {
                id: "1",
                sourceAccount: {
                  id: "GBRPYHIL2CI3WHZDTOOQFC6EB4CGQOFN4L5MHZ5RWBNRUBALXAS5F3B2",
                },
                type: "payment",
                createdAt: "2024-01-01T00:00:00Z",
              },
            ],
            memo: {
              type: "text",
              value: "test memo",
            },
            signatures: ["signature"],
            valid_after: "2024-01-01T00:00:00Z",
            valid_before: "2024-01-02T00:00:00Z",
            ext: {
              v: 0,
            },
          },
          txResult: {
            feeCharged: "300",
            result: {
              code: 0,
              results: [],
              ext: {
                v: 0,
              },
            },
            ext: {
              v: 0,
            },
          },
        },
      });
    }

    if (method === "getEvents") {
      return HttpResponse.json({
        id: body.id,
        jsonrpc: "2.0",
        result: {
          latestLedger: 123456,
          latestLedgerCloseTime: "1234567890",
          oldestLedger: 1,
          oldestLedgerCloseTime: "1000000000",
          events: [
            {
              type: "contract",
              ledger: 123000,
              ledgerClosedAt: "2024-01-01T00:00:00Z",
              contractId:
                "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
              id: "0-0",
              pagingToken: "0-0",
              topic: [
                "AAAADwAAAARoZWxsbw==",
                "AAAAEQAAAADSuZLn4FkGFx3d5GhFE",
              ],
              value: {
                type: "sym",
                sym: "aGVsbG8=",
              },
              inSuccessfulContractInvocation: true,
              txn_result_code: "txSUCCESS",
              tx_set_operation_count: 0,
              extends_transaction_set: [],
              created_at: "2024-01-01T00:00:00Z",
            },
          ],
        },
      });
    }

    if (method === "getLatestLedger") {
      return HttpResponse.json({
        id: body.id,
        jsonrpc: "2.0",
        result: {
          id: "abc123",
          protocolVersion: 20,
          sequence: 123456,
          successTransactionCount: 1000,
          failedTransactionCount: 5,
          operationCount: 5000,
          closedAt: "2024-01-01T00:00:00Z",
          totalCoins: "50000000000",
          baseFeeInStroops: 100,
          baseReserveInStroops: 5000000000,
          maxTxSetSize: 1000,
          headerHash: "header_hash",
        },
      });
    }

    return HttpResponse.json({
      id: body.id,
      jsonrpc: "2.0",
      error: {
        code: -32601,
        message: "Method not found",
      },
    });
  }),
];

export const errorHandlers = {
  nodeTimeout: [
    http.post("/rpc", () => {
      return HttpResponse.error();
    }),
  ],

  transactionFailed: [
    http.post("/rpc", async ({ request }) => {
      const body = await request.json() as any;
      const method = body.method;

      if (method === "simulateTransaction") {
        return HttpResponse.json({
          id: body.id,
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
            data: "Transaction simulation failed",
          },
        });
      }

      if (method === "getTransaction") {
        return HttpResponse.json({
          id: body.id,
          jsonrpc: "2.0",
          result: {
            status: "FAILED",
            latestLedger: 123456,
            latestLedgerCloseTime: "1234567890",
            oldestLedger: 1,
            oldestLedgerCloseTime: "1000000000",
            resultXdr: "result_xdr",
          },
        });
      }

      return HttpResponse.json({
        id: body.id,
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
        },
      });
    }),
  ],
};
