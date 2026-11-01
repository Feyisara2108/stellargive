import type { AlbedoIntent } from "@albedo-link/intent";
import { NETWORK_PASSPHRASE } from "./network";

/**
 * Wallet abstraction, so the app isn't tied to Freighter. Each supported wallet
 * implements `WalletAdapter`; WalletProvider and soroban.ts only talk to the
 * functions exported here and never to a wallet SDK directly.
 *
 * Wallet SDKs are browser-only, so they're imported lazily inside each adapter.
 * That keeps this module (and soroban.ts, which imports it lazily) safe to load
 * on the server and keeps unused wallets out of the page bundle.
 *
 * With NEXT_PUBLIC_USE_MOCK_WALLET=true (unit/e2e runs) no wallet is touched:
 * MockWalletProvider owns the connection state and signing returns the
 * transaction unchanged, which the mocked RPC accepts.
 */

export type WalletId = "freighter" | "albedo" | "hana" | "rabet";

export interface WalletInfo {
  id: WalletId;
  name: string;
  /** Where to get the wallet when it isn't installed. */
  url: string;
  /** Web wallets work without installing a browser extension. */
  kind: "extension" | "web";
}

interface WalletAdapter extends WalletInfo {
  isAvailable(): Promise<boolean>;
  /** Prompts the user for access and returns their address. */
  connect(): Promise<string>;
  /**
   * Re-reads the address of a session granted on an earlier visit, without
   * prompting. Wallets that can't be queried silently omit this, and the
   * address stored at connect time is used instead.
   */
  restore?(): Promise<string | null>;
  /** Network passphrase the wallet is on, or null if unknown. */
  getNetwork(): Promise<string | null>;
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ): Promise<string>;
  /** Present only on wallets that can switch networks on the user's behalf. */
  setNetwork?(networkPassphrase: string): Promise<void>;
}

const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

/** Wallet APIs reject with strings or `{ message }` objects as often as Errors. */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "string") return new Error(e);
  if (e && typeof e === "object" && "message" in e) {
    return new Error(String((e as { message: unknown }).message));
  }
  return new Error(String(e));
}

const isBrowser = () => typeof window !== "undefined";

// ─── Freighter ────────────────────────────────────────────────────────────────

const freighter: WalletAdapter = {
  id: "freighter",
  name: "Freighter",
  url: "https://www.freighter.app",
  kind: "extension",
  async isAvailable() {
    if (!isBrowser()) return false;
    const { isConnected } = await import("@stellar/freighter-api");
    const result = await isConnected();
    return Boolean(result?.isConnected);
  },
  async connect() {
    const { requestAccess } = await import("@stellar/freighter-api");
    const result = await requestAccess();
    if (result.error || !result.address) {
      throw toError(result.error ?? "Freighter did not return an address");
    }
    return result.address;
  },
  async restore() {
    const { getAddress } = await import("@stellar/freighter-api");
    const result = await getAddress();
    // Freighter returns an empty address until the site has been allowed.
    return result && !result.error && result.address ? result.address : null;
  },
  async getNetwork() {
    const { getNetwork } = await import("@stellar/freighter-api");
    const result = await getNetwork();
    return result && !result.error ? result.networkPassphrase || null : null;
  },
  async signTransaction(xdr, opts) {
    const { signTransaction } = await import("@stellar/freighter-api");
    const result = await signTransaction(xdr, opts);
    if (result.error) throw toError(result.error);
    return result.signedTxXdr;
  },
};

// ─── Albedo (web wallet, no extension) ───────────────────────────────────────

async function loadAlbedo(): Promise<AlbedoIntent> {
  const mod = await import("@albedo-link/intent");
  return ((mod as unknown as { default?: AlbedoIntent }).default ?? mod) as AlbedoIntent;
}

/** Albedo takes "public"/"testnet" for the SDF networks, else the passphrase. */
function albedoNetwork(passphrase: string): string {
  if (passphrase === PUBLIC_PASSPHRASE) return "public";
  if (passphrase === TESTNET_PASSPHRASE) return "testnet";
  return passphrase;
}

const albedo: WalletAdapter = {
  id: "albedo",
  name: "Albedo",
  url: "https://albedo.link",
  kind: "web",
  async isAvailable() {
    return isBrowser();
  },
  async connect() {
    const intent = await loadAlbedo();
    const { pubkey } = await intent.publicKey({});
    return pubkey;
  },
  // Albedo can't be queried silently; it signs for whichever network we ask.
  async getNetwork() {
    return NETWORK_PASSPHRASE;
  },
  async signTransaction(xdr, { networkPassphrase, address }) {
    const intent = await loadAlbedo();
    const { signed_envelope_xdr } = await intent.tx({
      xdr,
      pubkey: address,
      network: albedoNetwork(networkPassphrase),
    });
    return signed_envelope_xdr;
  },
};

// ─── Hana (injected extension API) ───────────────────────────────────────────

interface HanaStellarApi {
  getPublicKey(): Promise<string>;
  signTransaction(opts: {
    xdr: string;
    accountToSign?: string;
    networkPassphrase?: string;
  }): Promise<string>;
}

function hanaApi(): HanaStellarApi | undefined {
  return isBrowser()
    ? (window as unknown as { hanaWallet?: { stellar?: HanaStellarApi } }).hanaWallet?.stellar
    : undefined;
}

function requireHana(): HanaStellarApi {
  const api = hanaApi();
  if (!api) throw new Error("Hana Wallet is not installed");
  return api;
}

const hana: WalletAdapter = {
  id: "hana",
  name: "Hana",
  url: "https://hanawallet.io",
  kind: "extension",
  async isAvailable() {
    return Boolean(hanaApi());
  },
  async connect() {
    return requireHana().getPublicKey();
  },
  // Hana signs for the network passphrase we pass it.
  async getNetwork() {
    return NETWORK_PASSPHRASE;
  },
  async signTransaction(xdr, { networkPassphrase, address }) {
    return requireHana().signTransaction({ xdr, accountToSign: address, networkPassphrase });
  },
};

// ─── Rabet (injected extension API) ──────────────────────────────────────────

interface RabetApi {
  connect(): Promise<{ publicKey: string }>;
  sign(xdr: string, network: "mainnet" | "testnet"): Promise<{ xdr: string }>;
}

function rabetApi(): RabetApi | undefined {
  return isBrowser() ? (window as unknown as { rabet?: RabetApi }).rabet : undefined;
}

function requireRabet(): RabetApi {
  const api = rabetApi();
  if (!api) throw new Error("Rabet is not installed");
  return api;
}

/** Rabet only knows mainnet and testnet. */
function rabetNetwork(passphrase: string): "mainnet" | "testnet" | null {
  if (passphrase === PUBLIC_PASSPHRASE) return "mainnet";
  if (passphrase === TESTNET_PASSPHRASE) return "testnet";
  return null;
}

const rabet: WalletAdapter = {
  id: "rabet",
  name: "Rabet",
  url: "https://rabet.io",
  kind: "extension",
  async isAvailable() {
    return Boolean(rabetApi());
  },
  async connect() {
    const { publicKey } = await requireRabet().connect();
    return publicKey;
  },
  async getNetwork() {
    return rabetNetwork(NETWORK_PASSPHRASE) ? NETWORK_PASSPHRASE : null;
  },
  async signTransaction(xdr, { networkPassphrase }) {
    const network = rabetNetwork(networkPassphrase);
    if (!network) throw new Error(`Rabet doesn't support the network: ${networkPassphrase}`);
    const result = await requireRabet().sign(xdr, network);
    return result.xdr;
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

const ADAPTERS: Record<WalletId, WalletAdapter> = { freighter, albedo, hana, rabet };

/** Supported wallets, in the order the picker shows them. */
export const WALLETS: WalletInfo[] = [freighter, albedo, hana, rabet].map(
  ({ id, name, url, kind }) => ({ id, name, url, kind }),
);

const USE_MOCK_WALLET = process.env.NEXT_PUBLIC_USE_MOCK_WALLET === "true";
export const SELECTED_WALLET_KEY = "stellargive:wallet-id";
export const WALLET_ADDRESS_KEY = "stellargive:wallet-address";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

function selectedAdapter(): WalletAdapter | null {
  const id = readStorage(SELECTED_WALLET_KEY);
  return id && id in ADAPTERS ? ADAPTERS[id as WalletId] : null;
}

/** Extension probes can hang when the extension isn't installed; treat that as absent. */
const AVAILABILITY_TIMEOUT_MS = 1_500;

/** Whether a wallet can be used in this browser (e.g. its extension is installed). */
export async function isWalletAvailable(id: WalletId): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ADAPTERS[id].isAvailable(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), AVAILABILITY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Address of the wallet the user connected on a previous visit, without
 * prompting. Null when no wallet was connected (or it was disconnected).
 */
export async function restoreWallet(): Promise<string | null> {
  if (USE_MOCK_WALLET) return null;
  const adapter = selectedAdapter();
  if (!adapter) return null;
  try {
    if (!(await isWalletAvailable(adapter.id))) return null;
    if (adapter.restore) {
      const address = await adapter.restore();
      if (address) writeStorage(WALLET_ADDRESS_KEY, address);
      return address;
    }
    return readStorage(WALLET_ADDRESS_KEY);
  } catch {
    return null;
  }
}

/** Requests access from the chosen wallet. Rejects if the user denies it. */
export async function connectWallet(id: WalletId): Promise<string> {
  const adapter = ADAPTERS[id];
  let address: string;
  try {
    address = await adapter.connect();
  } catch (e) {
    throw toError(e);
  }
  if (!address) throw new Error(`${adapter.name} did not return an address`);
  writeStorage(SELECTED_WALLET_KEY, id);
  writeStorage(WALLET_ADDRESS_KEY, address);
  return address;
}

/** Network passphrase the connected wallet is currently on, or null if unknown. */
export async function getWalletNetwork(): Promise<string | null> {
  if (USE_MOCK_WALLET) return NETWORK_PASSPHRASE;
  try {
    return (await selectedAdapter()?.getNetwork()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Some wallets could change their active network on the user's behalf; none of
 * the supported ones (Freighter included) can today. Returns the selected
 * wallet's switch function when it has one, so callers can fall back to manual
 * instructions otherwise.
 */
export async function getNetworkSwitcher(): Promise<
  ((networkPassphrase: string) => Promise<void>) | null
> {
  if (USE_MOCK_WALLET) return null;
  const adapter = selectedAdapter();
  return adapter?.setNetwork ? adapter.setNetwork.bind(adapter) : null;
}

/** Signs a transaction XDR with the connected wallet and returns the signed XDR. */
export async function signTransaction(
  txXdr: string,
  opts: { networkPassphrase: string; address: string },
): Promise<string> {
  if (USE_MOCK_WALLET) return txXdr;
  try {
    const adapter = selectedAdapter();
    if (!adapter) throw new Error("No wallet connected");
    return await adapter.signTransaction(txXdr, opts);
  } catch (e) {
    // mapTransactionError shows "Wallet error" failures as a cancelled transaction.
    throw new Error(`Wallet error: ${toError(e).message}`);
  }
}

/** Forgets the selected wallet so the next visit doesn't silently reconnect. */
export async function disconnectWallet(): Promise<void> {
  writeStorage(SELECTED_WALLET_KEY, null);
  writeStorage(WALLET_ADDRESS_KEY, null);
}
