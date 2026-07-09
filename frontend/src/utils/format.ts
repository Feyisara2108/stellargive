export const formatStroop = (stroop: bigint): string => {
  return (Number(stroop) / 10_000_000).toFixed(7);
};

export const formatAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export const formatXLM = (xlm: number): string => {
  return xlm.toFixed(7).replace(/\.?0+$/, "");
};

export const formatTokenAmount = (raw: bigint | string | number, decimals: number = 7): string => {
  const n = BigInt(raw);
  const divisor = BigInt(10 ** decimals);
  const intPart = (n / divisor).toString();

  if (decimals === 0) return intPart;

  let decRaw = (n % divisor).toString();
  // Handle negative remainder
  if (decRaw.startsWith("-")) decRaw = decRaw.slice(1);
  decRaw = decRaw.padStart(decimals, "0");

  const decPart = decRaw.replace(/0+$/, "");

  // Handle negative zero for formatting (e.g. -0.5)
  if (n < 0n && intPart === "0") {
    return decPart.length > 0 ? `-0.${decPart}` : "0";
  }

  return decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
};

export const toRawAmount = (amount: string | number, decimals: number = 7): bigint => {
  const str = amount.toString().trim();

  // Reject non-numeric inputs (allow .5, 5., 5.5)
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(str)) {
    throw new Error("Invalid amount: not a number");
  }

  const parts = str.split(".");
  const isNegative = parts[0].startsWith("-");
  const intPart = isNegative ? parts[0].slice(1) : parts[0];

  if (parts.length > 1 && parts[1].length > decimals) {
    throw new Error(`Invalid amount: exceeds ${decimals} decimal places`);
  }

  let raw = BigInt(intPart || "0") * BigInt(10 ** decimals);
  if (parts.length > 1 && parts[1].length > 0) {
    const fraction = parts[1].padEnd(decimals, "0");
    raw += BigInt(fraction);
  }

  return isNegative ? -raw : raw;
};
