// Deployment constants with no Stellar SDK dependency, so layout-level UI
// (Footer, Navbar) can read them without pulling the SDK into every route.

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID || "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
export const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "http://localhost:8000/rpc";
