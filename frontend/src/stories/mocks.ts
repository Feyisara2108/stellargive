import type { Campaign } from "@/lib/soroban";

const ONE_DAY = 60 * 60 * 24;
const nowSec = () => Math.floor(Date.now() / 1000);

const stroops = (xlm: number): bigint => BigInt(xlm) * 10_000_000n;

export const mockCampaign: Campaign = {
  id: 1n,
  creator: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
  beneficiary: "GCDEMOBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  title: "Flood Relief — Lagos",
  category: "relief",
  target_amount: stroops(1_000_000),
  raised_amount: stroops(350_000),
  deadline: BigInt(nowSec() + 14 * ONE_DAY),
  accepted_token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  status: "Active",
};

export const mockFundedCampaign: Campaign = {
  ...mockCampaign,
  id: 2n,
  title: "School Rebuild — Ibadan",
  raised_amount: stroops(1_000_000),
  status: "Funded",
};

export const mockExpiredCampaign: Campaign = {
  ...mockCampaign,
  id: 3n,
  title: "Emergency Shelter — Past Deadline",
  raised_amount: stroops(120_000),
  deadline: BigInt(nowSec() - 2 * ONE_DAY),
  status: "Expired",
};

export const mockClaimedCampaign: Campaign = {
  ...mockCampaign,
  id: 4n,
  title: "Medical Aid — Settled",
  raised_amount: 0n,
  status: "Claimed",
};
