#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../frontend/.env.local') });
const {
  Keypair,
  nativeToScVal,
  scValToNative,
  Contract,
  rpc,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Address,
  xdr,
  Operation
} = require('@stellar/stellar-sdk');

const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET;
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID;
const TOKEN_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'; // Native XLM SAC on Testnet

if (!CONTRACT_ID) {
  console.error("Error: NEXT_PUBLIC_CONTRACT_ID must be set in frontend/.env.local");
  process.exit(1);
}

const server = new rpc.Server(RPC_URL);

async function run() {
  console.log("=== StellarGive Stress Test ===");
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`Network: ${PASSPHRASE}`);
  console.log(`Contract: ${CONTRACT_ID}`);

  // 1. Setup temporary master account via Friendbot
  const masterKeypair = Keypair.random();
  console.log(`\n1. Funding temporary master account ${masterKeypair.publicKey()} via Friendbot...`);
  const friendbotRes = await fetch(`https://friendbot.stellar.org/?addr=${masterKeypair.publicKey()}`);
  if (!friendbotRes.ok) {
    throw new Error(`Friendbot failed: ${friendbotRes.statusText}`);
  }

  // Poll until master account is funded
  let masterAccount = null;
  for (let i = 0; i < 15; i++) {
    try {
      masterAccount = await server.getAccount(masterKeypair.publicKey());
      break;
    } catch (err) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!masterAccount) {
    throw new Error("Temporary master account was not funded in time by Friendbot.");
  }
  console.log(`✅ Master account funded successfully!`);

  // 2. Generate and fund 100 donor keypairs in a single batch transaction
  console.log("\n2. Generating 100 donor keypairs...");
  const keypairs = [];
  for (let i = 0; i < 100; i++) {
    keypairs.push(Keypair.random());
  }

  console.log("Creating and funding all 100 donor accounts in a single batch transaction (bypassing Friendbot limits)...");
  let fundTxBuilder = new TransactionBuilder(masterAccount, {
    fee: "200000", // 2,000 stroops per operation
    networkPassphrase: PASSPHRASE
  }).setTimeout(60);

  for (let i = 0; i < 100; i++) {
    fundTxBuilder.addOperation(Operation.createAccount({
      destination: keypairs[i].publicKey(),
      startingBalance: "25.0" // 25 XLM each
    }));
  }

  let fundTx = fundTxBuilder.build();
  fundTx.sign(masterKeypair);

  const fundSend = await server.sendTransaction(fundTx);
  if (fundSend.errorResultXdr) {
    throw new Error(`Batch funding submission failed: ${fundSend.errorResultXdr}`);
  }

  console.log(`Submitted batch funding transaction. Hash: ${fundSend.hash}`);
  console.log("Polling for ledger confirmation...");
  let fundTxResult = await server.getTransaction(fundSend.hash);
  while (fundTxResult.status === "NOT_FOUND") {
    await new Promise(r => setTimeout(r, 1000));
    fundTxResult = await server.getTransaction(fundSend.hash);
  }
  if (fundTxResult.status !== "SUCCESS") {
    throw new Error(`Batch funding transaction failed with status: ${fundTxResult.status}`);
  }
  console.log("✅ All 100 donor accounts funded and created successfully!");

  // 3. Create a dedicated campaign for stress test
  console.log("\n3. Creating a fresh campaign for the stress test...");
  const contract = new Contract(CONTRACT_ID);
  
  // Format beneficiaries: Vec<(Address, u32)>
  const beneficiariesVal = xdr.ScVal.scvVec([
    xdr.ScVal.scvVec([
      new Address(masterKeypair.publicKey()).toScVal(),
      nativeToScVal(10000, { type: "u32" })
    ])
  ]);

  // create_campaign expects 10 args: creator, beneficiaries, title, description,
  // metadata_uri, category, target_amount, deadline, accepted_token, max_per_donor
  const campaignArgs = [
    new Address(masterKeypair.publicKey()).toScVal(),
    beneficiariesVal,
    nativeToScVal("Stress Test Campaign", { type: "string" }),
    nativeToScVal("Automated stress-test campaign for concurrent donation load.", { type: "string" }),
    nativeToScVal("https://example.com/meta", { type: "string" }),
    nativeToScVal("relief", { type: "symbol" }),
    nativeToScVal(20000000000n, { type: "i128" }), // 20,000 XLM target
    nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 86400), { type: "u64" }), // 1 day deadline
    new Address(TOKEN_CONTRACT_ID).toScVal(),
    nativeToScVal(null, { type: "i128" }) // max_per_donor: None
  ];

  // We need fresh sequence number for master account
  masterAccount = await server.getAccount(masterKeypair.publicKey());
  let campaignTx = new TransactionBuilder(masterAccount, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE
  })
    .addOperation(contract.call("create_campaign", ...campaignArgs))
    .setTimeout(30)
    .build();

  console.log("Preparing campaign creation transaction...");
  const campaignPrepared = await server.prepareTransaction(campaignTx);
  campaignPrepared.sign(masterKeypair);

  const campaignSend = await server.sendTransaction(campaignPrepared);
  if (campaignSend.errorResultXdr) {
    throw new Error(`Campaign creation failed: ${campaignSend.errorResultXdr}`);
  }

  let campaignTxResult = await server.getTransaction(campaignSend.hash);
  while (campaignTxResult.status === "NOT_FOUND") {
    await new Promise(r => setTimeout(r, 1000));
    campaignTxResult = await server.getTransaction(campaignSend.hash);
  }
  if (campaignTxResult.status !== "SUCCESS") {
    throw new Error(`Campaign creation failed with status: ${campaignTxResult.status}`);
  }

  const campaignId = scValToNative(campaignTxResult.returnValue);
  console.log(`✅ Campaign created successfully! Campaign ID: ${campaignId}`);

  // 4. Send 100 concurrent donations in parallel
  console.log(`\n4. Sending 100 parallel donations of 10 XLM each to Campaign #${campaignId}...`);
  const donationAmount = 100000000n; // 10 XLM in stroops

  const promises = keypairs.map(async (kp, idx) => {
    const donorAddress = kp.publicKey();
    const start = Date.now();
    try {
      const account = await server.getAccount(donorAddress);
      let tx = new TransactionBuilder(account, {
        fee: "10000",
        networkPassphrase: PASSPHRASE
      })
        .addOperation(
          contract.call(
            "donate",
            new Address(donorAddress).toScVal(),
            nativeToScVal(BigInt(campaignId), { type: "u64" }),
            nativeToScVal(donationAmount, { type: "i128" }),
            nativeToScVal(false, { type: "bool" }),
            nativeToScVal(null, { type: "string" })
          )
        )
        .setTimeout(30)
        .build();

      const preparedTx = await server.prepareTransaction(tx);
      preparedTx.sign(kp);

      const send = await server.sendTransaction(preparedTx);
      if (send.errorResultXdr) {
        return { success: false, latency: Date.now() - start, error: `Send failed XDR: ${send.errorResultXdr}` };
      }

      let res = await server.getTransaction(send.hash);
      while (res.status === "NOT_FOUND") {
        await new Promise(r => setTimeout(r, 1000));
        res = await server.getTransaction(send.hash);
      }

      const latency = Date.now() - start;
      if (res.status === "SUCCESS") {
        return { success: true, latency, hash: send.hash };
      } else {
        return { success: false, latency, error: `Transaction finished with status: ${res.status}` };
      }
    } catch (err) {
      return { success: false, latency: Date.now() - start, error: err.message };
    }
  });

  const results = await Promise.all(promises);

  // 5. Compute statistics and log results
  console.log("\n5. Computing stress test statistics...");
  let successCount = 0;
  let failureCount = 0;
  let totalLatency = 0;
  const failureReasons = {};

  results.forEach((res, i) => {
    if (res.success) {
      successCount++;
      totalLatency += res.latency;
    } else {
      failureCount++;
      const reason = res.error || "Unknown error";
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      console.error(`Donor #${i+1} failed: ${reason}`);
    }
  });

  const successRate = (successCount / results.length) * 100;
  const failureRate = (failureCount / results.length) * 100;
  const avgLatency = successCount > 0 ? totalLatency / successCount : 0;

  console.log("\n--- Stress Test Results Summary ---");
  console.log(`Total Requests Sent: ${results.length}`);
  console.log(`Success Count: ${successCount}`);
  console.log(`Failure Count: ${failureCount}`);
  console.log(`Success Rate: ${successRate.toFixed(2)}%`);
  console.log(`Average Latency (Successes): ${avgLatency.toFixed(2)}ms`);
  console.log("-----------------------------------");

  const output = {
    timestamp: new Date().toISOString(),
    totalRequests: results.length,
    successCount,
    failureCount,
    successRate: parseFloat(successRate.toFixed(2)),
    failureRate: parseFloat(failureRate.toFixed(2)),
    averageLatencyMs: parseFloat(avgLatency.toFixed(2)),
    failureReasons,
    results: results.map(r => ({
      success: r.success,
      latency: r.latency,
      hash: r.hash || null,
      error: r.error || null
    }))
  };

  const outputPath = path.join(__dirname, '../stress-test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Results saved to: ${outputPath}`);

  // Create findings documentation
  let recommendations = "";
  if (failureRate > 5.0) {
    console.warn(`⚠️ Warning: Failure rate of ${failureRate.toFixed(2)}% is higher than 5% threshold.`);
    recommendations = "Findings and recommendations:\n- **High concurrent volume** hit RPC limits, gas/fee boundaries, or transient transaction bottlenecks.\n- **Recommendations:** Implement queue-based client-side pacing, retry mechanisms, optimization of contract data footprint, or a specialized sequence-management layer to avoid congestion.";
  } else {
    recommendations = "Findings and recommendations:\n- **Excellent performance profile.** The Stellar Soroban contract and network successfully ingested and processed 100 parallel donation operations.\n- **Recommendations:** The current architecture scales extremely well. No immediate optimizations are required, but continuous monitoring of RPC node capacity is advised as usage grows.";
  }

  const findingsPath = path.join(__dirname, '../STRESS_TEST_FINDINGS.md');
  const findingsMD = `# Stress Test Findings

Conducted on: ${output.timestamp}
Contract ID: \`${CONTRACT_ID}\`

## Executive Summary
- **Total Transactions:** 100
- **Success Rate:** ${output.successRate}%
- **Failure Rate:** ${output.failureRate}%
- **Average Latency:** ${output.averageLatencyMs} ms

## Performance Profile & Failures
${failureCount > 0 ? `We observed ${failureCount} failed transactions. Breakdown of failure reasons:\n\n` + Object.entries(failureReasons).map(([r, count]) => `- **${r}:** ${count} occurrences`).join('\n') : "No failures were recorded during the run. All transactions successfully executed."}

## Recommendations & Optimization Path
${recommendations}
`;
  fs.writeFileSync(findingsPath, findingsMD);
  console.log(`Findings documented in: ${findingsPath}`);
}

run().catch(err => {
  console.error("Stress test run failed with critical error:", err);
  process.exit(1);
});
