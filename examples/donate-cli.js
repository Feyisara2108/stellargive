require('dotenv').config();
const {
  Keypair,
  nativeToScVal,
  scValToNative,
  Contract,
  rpc,
  Networks,
  TransactionBuilder,
  BASE_FEE
} = require('@stellar/stellar-sdk');

/**
 * Example Donation CLI Script
 * 
 * This script demonstrates how to interact with the StellarGive Soroban smart contract.
 * It fetches a campaign's state and then constructs, simulates, signs, and submits 
 * a donation transaction to the network.
 */

// Load Environment Variables
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const SECRET_KEY = process.env.DONOR_SECRET_KEY;
const CONTRACT_ID = process.env.CONTRACT_ID;

// Validate Required Environment Variables
if (!SECRET_KEY || !CONTRACT_ID) {
  console.error("Error: DONOR_SECRET_KEY and CONTRACT_ID must be set in your .env file or environment.");
  process.exit(1);
}

// 1. Validate CLI Arguments
const args = process.argv.slice(2);
if (args.length < 3 || args.length > 5) {
  console.error("Usage: node donate-cli.js <campaign_id> <amount> <token_contract> [is_anonymous] [comment]");
  console.error("Example: node donate-cli.js 1 10000000 CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC false "Great cause"");
  process.exit(1);
}

const [campaignIdStr, amountStr, tokenContractId, isAnonymousStr, comment] = args;
const campaignId = parseInt(campaignIdStr, 10);
const amount = BigInt(amountStr);
const isAnonymous = isAnonymousStr === 'true';

if (isNaN(campaignId) || campaignId <= 0) {
  console.error("Error: <campaign_id> must be a positive integer.");
  process.exit(1);
}

if (amount <= 0n) {
  console.error("Error: <amount> must be positive.");
  process.exit(1);
}

// 2. Initialize RPC Server, Donor Account, and Contract
// We initialize the RPC server to communicate with the Stellar network.
const server = new rpc.Server(RPC_URL);

// Load the donor's keypair from the secret key so we can sign the transaction later.
const donorKeypair = Keypair.fromSecret(SECRET_KEY);
const donorAddress = donorKeypair.publicKey();

// Create a Contract instance which helps build operations for this specific contract.
const contract = new Contract(CONTRACT_ID);

/**
 * Helper to fetch a fresh transaction builder.
 * It fetches the current sequence number for the donor's account from the network.
 */
async function getTxBuilder() {
  const account = await server.getAccount(donorAddress);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  }).setTimeout(30); // 30 second timeout for the transaction
}

/**
 * 3. Fetch Campaign
 * 
 * Fetches the current state of a campaign by invoking the `get_campaign` contract method.
 * We use simulation to read the state without actually submitting a transaction.
 */
async function getCampaign(id) {
  console.log(`\nFetching Campaign ID: ${id}...`);
  
  // Convert native JS types to Soroban ScVals
  const contractArgs = [nativeToScVal(id, { type: 'u64' })];
  
  // Build an operation to call `get_campaign`
  const txBuilder = await getTxBuilder();
  const tx = txBuilder.addOperation(contract.call('get_campaign', ...contractArgs)).build();
  
  try {
    // Simulate the transaction to get the return value (the campaign data)
    const simResponse = await server.simulateTransaction(tx);
    
    if (simResponse.error) {
      console.error(`Error simulating get_campaign: ${simResponse.error}`);
      process.exit(1);
    }
    
    if (simResponse.result && simResponse.result.retval) {
      // Parse the returned ScVal back to a native JS object
      const resultVal = scValToNative(simResponse.result.retval);
      
      console.log("\n--- Campaign Summary ---");
      console.log(`Title: ${resultVal.title}`);
      console.log(`Status: ${JSON.stringify(resultVal.status)}`);
      console.log(`Target Amount: ${resultVal.target_amount} (stroops)`);
      console.log(`Raised Amount: ${resultVal.raised_amount} (stroops)`);
      console.log("------------------------\n");
      
      // Basic check: Enums in ScVal often convert to objects like { Active: undefined } or strings like 'Active'
      const statusStr = typeof resultVal.status === 'object' ? Object.keys(resultVal.status)[0] : resultVal.status;
      if (statusStr !== 'Active') {
        console.warn(`Warning: Campaign status is '${statusStr}'. Donations may fail if the campaign is not active.`);
      }
      return resultVal;
    } else {
      console.error("Failed to parse campaign details.");
      process.exit(1);
    }
  } catch (err) {
    console.error("Error fetching campaign. It might not exist.", err.message);
    process.exit(1);
  }
}

/**
 * 4. Donation Flow
 * 
 * Builds, simulates, signs, and submits the donation transaction.
 */
async function donate() {
  // Validate campaign state first
  await getCampaign(campaignId);
  
  console.log(`Building donation transaction for Campaign ${campaignId}...`);
  console.log(`Amount: ${amount} stroops`);
  console.log(`Token: ${tokenContractId}`);
  
  // Convert arguments to ScVals for the `donate` method:
  // donate(donor: Address, campaign_id: u64, amount: i128, is_anonymous: bool, comment: Option<String>)
  const contractArgs = [
    nativeToScVal(donorAddress, { type: 'address' }),
    nativeToScVal(campaignId, { type: 'u64' }),
    nativeToScVal(amount, { type: 'i128' }),
    nativeToScVal(isAnonymous, { type: 'bool' }),
    comment ? nativeToScVal(comment, { type: 'string' }) : nativeToScVal(null, { type: 'option' }),
  ];

  try {
    let txBuilder = await getTxBuilder();
    let tx = txBuilder.addOperation(contract.call('donate', ...contractArgs)).build();

    console.log("Simulating transaction to calculate footprint and fees...");
    
    // Simulate the transaction. This tells us the storage footprint required and expected fee.
    const simResponse = await server.simulateTransaction(tx);
    
    if (simResponse.error || !simResponse.transactionData) {
      console.error("\n❌ Simulation failed. Ensure:");
      console.error(" - Your account has sufficient XLM to pay for fees.");
      console.error(" - You have sufficient token balance to donate.");
      console.error(" - The campaign is active.");
      if (simResponse.error) console.error("Error details:", simResponse.error);
      process.exit(1);
    }

    // Assemble the final transaction with the required footprint (transactionData) and updated fee
    tx = rpc.assembleTransaction(tx, PASSPHRASE, simResponse).build();
    
    console.log("Signing transaction...");
    // Sign the transaction with the donor's keypair
    tx.sign(donorKeypair);
    
    console.log("Submitting transaction to the network...");
    // Submit the signed transaction to the Soroban RPC
    const sendResponse = await server.sendTransaction(tx);
    
    if (sendResponse.errorResultXdr) {
      console.error("❌ Transaction failed during submission.");
      console.error("XDR:", sendResponse.errorResultXdr);
      process.exit(1);
    }
    
    console.log(`✅ Transaction submitted successfully!`);
    console.log(`Transaction Hash: ${sendResponse.hash}`);
    
    console.log("Polling for final network confirmation...");
    let txResult = await server.getTransaction(sendResponse.hash);
    
    // The transaction status might be NOT_FOUND while it is being processed by the network
    while (txResult.status === "NOT_FOUND") {
      await new Promise(resolve => setTimeout(resolve, 2000));
      txResult = await server.getTransaction(sendResponse.hash);
    }
    
    if (txResult.status === "SUCCESS") {
      console.log(`\n🎉 Donation of ${amount} stroops completed successfully!`);
      
      // Optionally fetch the campaign again to show updated amount
      await getCampaign(campaignId);
    } else {
      console.error(`\n❌ Transaction failed with status: ${txResult.status}`);
      if (txResult.resultXdr) {
         console.error("Failure XDR:", txResult.resultXdr);
      }
    }
    
  } catch (error) {
    console.error("An unexpected error occurred during the donation flow:");
    console.error(error.message);
  }
}

// Execute the donation flow
donate();
