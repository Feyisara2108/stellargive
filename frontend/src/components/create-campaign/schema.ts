import type { Path } from "react-hook-form";
import * as z from "zod";
import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";
import { CONTRACT_ID, isValidStellarAddress, type Campaign } from "@/lib/soroban";
import { TOTAL_SHARE_BPS, percentToBps } from "@/lib/beneficiaries";
import { INVALID_SHARES_MESSAGE } from "@/lib/contractErrors";

// Contract-enforced bounds — keep in sync with
// contracts/stellar-give/src/lib.rs constants. Surfacing them at the form
// layer prevents users from spending gas on a simulation that the chain
// will reject for a value we could have rejected locally.
export const MAX_TITLE_LEN = 50; // MAX_TITLE_LEN
export const MIN_TARGET_TOKEN = 1; // MIN_TARGET = 10_000_000 stroops = 1.0 token
export const MAX_DURATION_DAYS = 365; // MAX_DURATION = 31_536_000 sec
export const MAX_METADATA_URI_LEN = 256; // MAX_METADATA_URI_LEN
export const MAX_DESCRIPTION_LEN = 500;

// Client-side cap on payout recipients — the contract has no limit, but every
// beneficiary adds a token transfer to the claim, so keep claims affordable.
export const MAX_BENEFICIARIES = 10;

// Tags constraints (client-side only — not enforced on-chain).
export const MAX_TAG_COUNT = 10;
export const MAX_TAG_LENGTH = 30;

const SHARE_FORMAT_MESSAGE = "Enter a percentage with up to 2 decimals";

const baseSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(MAX_TITLE_LEN, `Title cannot exceed ${MAX_TITLE_LEN} characters`),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(MAX_DESCRIPTION_LEN, `Description cannot exceed ${MAX_DESCRIPTION_LEN} characters`),
  beneficiary: z.string().refine(isValidStellarAddress, "Invalid Stellar address"),
  /** Primary beneficiary's share in percent; only editable once extra beneficiaries exist. */
  beneficiaryShare: z.string(),
  extraBeneficiaries: z.array(
    z.object({
      address: z.string().refine(isValidStellarAddress, "Invalid Stellar address"),
      share: z.string(),
    }),
  ),
  maxPerDonor: z
    .string()
    .optional()
    .refine(
      (val) =>
        !val || val.trim() === "" || (/^\d+(\.\d{1,7})?$/.test(val.trim()) && Number(val) > 0),
      "Maximum per donor must be a positive amount with up to 7 decimals",
    ),
  category: z
    .enum(["medical", "food", "shelter", "education", "relief", "other"])
    .optional()
    .or(z.literal("")),
  targetAmount: z.string().refine(
    (val) => {
      const n = Number(val);
      return !isNaN(n) && n >= MIN_TARGET_TOKEN;
    },
    `Target must be at least ${MIN_TARGET_TOKEN.toFixed(1)} (the contract's minimum)`,
  ),
  deadlineDays: z.string().refine((val) => {
    const n = Number(val);
    if (!Number.isInteger(n) || n < 1 || n > MAX_DURATION_DAYS) return false;
    const deadlineSec = Math.floor(Date.now() / 1000) + n * 24 * 60 * 60;
    return deadlineSec > Math.floor(Date.now() / 1000) + 3600;
  }, `Deadline must be between 1 and ${MAX_DURATION_DAYS} days and at least 1 hour in the future`),
  acceptedToken: z.string().regex(/^C[A-Z0-9]{55}$|^G[A-Z0-9]{55}$/, "Invalid Token address"),
  website: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.trim() === "" || val.startsWith("https://"),
      "Website URL must start with https://",
    ),
  twitter: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.trim() === "" || val.startsWith("https://"),
      "Twitter URL must start with https://",
    ),
  metadataUri: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.startsWith("ipfs://") || val.startsWith("https://"),
      "Metadata URI must start with ipfs:// or https://",
    )
    .refine(
      (val) => !val || val.length <= MAX_METADATA_URI_LEN,
      `Metadata URI must be ${MAX_METADATA_URI_LEN} characters or fewer`,
    ),
});

/**
 * Mirrors the contract's `InvalidShares` / `InvalidBeneficiary` checks so a bad
 * payout split is blocked before the creator signs anything.
 */
export const formSchema = baseSchema.superRefine((values, ctx) => {
  if (values.extraBeneficiaries.length === 0) return;

  const seen = new Set<string>([values.beneficiary]);
  values.extraBeneficiaries.forEach((b, i) => {
    if (seen.has(b.address)) {
      ctx.addIssue({
        code: "custom",
        message: "This beneficiary is already listed",
        path: ["extraBeneficiaries", i, "address"],
      });
    }
    seen.add(b.address);
  });
  [values.beneficiary, ...values.extraBeneficiaries.map((b) => b.address)].forEach((addr, i) => {
    if (addr === CONTRACT_ID) {
      ctx.addIssue({
        code: "custom",
        message: "Beneficiary cannot be the campaign contract address",
        path: i === 0 ? ["beneficiary"] : ["extraBeneficiaries", i - 1, "address"],
      });
    }
  });

  const shares = [
    { value: values.beneficiaryShare, path: ["beneficiaryShare"] },
    ...values.extraBeneficiaries.map((b, i) => ({
      value: b.share,
      path: ["extraBeneficiaries", i, "share"],
    })),
  ];
  let total = 0;
  let allParsed = true;
  for (const { value, path } of shares) {
    const bps = percentToBps(value);
    if (bps === null || bps <= 0) {
      allParsed = false;
      ctx.addIssue({
        code: "custom",
        message: bps === null ? SHARE_FORMAT_MESSAGE : "Share must be greater than 0%",
        path,
      });
    } else {
      total += bps;
    }
  }
  if (allParsed && total !== TOTAL_SHARE_BPS) {
    ctx.addIssue({
      code: "custom",
      message: `${INVALID_SHARES_MESSAGE} Currently ${(total / 100).toFixed(2).replace(/\.?0+$/, "")}%.`,
      path: ["beneficiaryShares"],
    });
  }
});

export type FormValues = z.infer<typeof baseSchema>;

/** Payout split in the contract's basis-point form; the primary gets 100% when alone. */
export function buildBeneficiaries(
  values: Partial<FormValues>,
): { address: string; share: number }[] {
  const extras = values.extraBeneficiaries ?? [];
  if (extras.length === 0) {
    return values.beneficiary ? [{ address: values.beneficiary, share: TOTAL_SHARE_BPS }] : [];
  }
  return [
    { address: values.beneficiary ?? "", share: percentToBps(values.beneficiaryShare ?? "") ?? 0 },
    ...extras.map((b) => ({ address: b.address, share: percentToBps(b.share) ?? 0 })),
  ];
}

export const DEFAULT_VALUES: FormValues = {
  title: "",
  description: "",
  beneficiary: "",
  category: "",
  targetAmount: "",
  deadlineDays: "30",
  acceptedToken: NATIVE_XLM_CONTRACT_ID,
  website: "",
  twitter: "",
  metadataUri: "",
  beneficiaryShare: "100",
  extraBeneficiaries: [],
  maxPerDonor: "",
};

export const TOTAL_STEPS = 3;

export const STEP_LABELS: Record<number, string> = { 1: "Details", 2: "Funding", 3: "Review" };

/** Fields validated before the wizard may advance past each step. */
export const STEP_FIELDS: Record<number, Path<FormValues>[]> = {
  1: ["title", "description", "category", "website", "twitter", "metadataUri"],
  2: [
    "beneficiary",
    "beneficiaryShare",
    "extraBeneficiaries",
    "acceptedToken",
    "targetAmount",
    "deadlineDays",
    "maxPerDonor",
  ],
};

export function calculateDeadlineTimestamp(deadlineDaysStr: string): number {
  return Math.floor(Date.now() / 1000) + parseInt(deadlineDaysStr, 10) * 24 * 60 * 60;
}

/** Build a synthetic Campaign object from current form values for preview. */
export function buildPreviewCampaign(
  values: Partial<FormValues>,
  tags: string[],
  walletAddress: string,
): Campaign {
  const days = parseInt(values.deadlineDays ?? "30") || 30;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 24 * 60 * 60);
  const targetRaw = parseFloat(values.targetAmount ?? "0") || 0;
  // Convert to stroops (7 decimal places)
  const targetAmount = BigInt(Math.round(targetRaw * 10_000_000));
  return {
    id: 0n,
    creator: walletAddress || "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    beneficiary:
      values.beneficiary ||
      walletAddress ||
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    beneficiaries: [],
    title: values.title || "Campaign Title",
    description: values.description || "",
    category: values.category || "other",
    target_amount: targetAmount,
    raised_amount: 0n,
    deadline,
    accepted_token: values.acceptedToken || NATIVE_XLM_CONTRACT_ID,
    status: "Active",
    metadata_uri: values.metadataUri || undefined,
    website: values.website || undefined,
    twitter: values.twitter || undefined,
    tags,
  };
}
