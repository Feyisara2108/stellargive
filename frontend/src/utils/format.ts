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
