// Stellar address validation without the Stellar SDK, so forms can reject a bad
// address synchronously before anything is loaded or signed. Mirrors
// `StrKey.isValidEd25519PublicKey` / `StrKey.isValidContract`: base32 decode,
// version byte, and the CRC16-XModem checksum over version + payload.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** Version byte for an ed25519 public key ("G…"): 6 << 3. */
const ED25519_PUBLIC_KEY_VERSION = 6 << 3;
/** Version byte for a contract address ("C…"): 2 << 3. */
const CONTRACT_VERSION = 2 << 3;

function base32Decode(input: string): Uint8Array | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of input) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  // Non-zero leftover bits mean a non-canonical encoding.
  if ((buffer & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(out);
}

function crc16XModem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function isValidStrKey(address: string, prefix: string, version: number): boolean {
  if (typeof address !== "string" || address.length !== 56 || address[0] !== prefix) return false;
  const decoded = base32Decode(address);
  if (!decoded || decoded.length !== 35) return false;
  if (decoded[0] !== version) return false;
  const checksum = decoded[33] | (decoded[34] << 8);
  return crc16XModem(decoded.subarray(0, 33)) === checksum;
}

/** True when `address` is a well-formed, checksum-valid Stellar account address (G…). */
export function isValidAccountAddress(address: string): boolean {
  return isValidStrKey(address, "G", ED25519_PUBLIC_KEY_VERSION);
}

/** True when `address` is a well-formed, checksum-valid contract address (C…). */
export function isValidContractAddress(address: string): boolean {
  return isValidStrKey(address, "C", CONTRACT_VERSION);
}
