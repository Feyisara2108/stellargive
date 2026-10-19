"use client";

import { NATIVE_XLM_CONTRACT_ID } from "@/lib/tokens";
import { useForm, useFieldArray, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCampaign, useResolvedName } from "@/hooks/useSoroban";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useWallet } from "@/lib/WalletProvider";
import { CONTRACT_ID, isValidStellarAddress } from "@/lib/soroban";
import { TOTAL_SHARE_BPS, percentToBps } from "@/lib/beneficiaries";
import { INVALID_SHARES_MESSAGE } from "@/lib/contractErrors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, PlusCircle, Tag, X, Eye, UserPlus } from "lucide-react";
import { TokenSelector, PREDEFINED_TOKENS } from "@/components/TokenSelector";
import { cn } from "@/lib/utils";
import { CampaignCard } from "@/components/CampaignCard";
import type { Campaign } from "@/lib/soroban";

// Contract-enforced bounds — keep in sync with
// contracts/stellar-give/src/lib.rs constants. Surfacing them at the form
// layer prevents users from spending gas on a simulation that the chain
// will reject for a value we could have rejected locally.
const MAX_TITLE_LEN = 50; // MAX_TITLE_LEN
const MIN_TARGET_TOKEN = 1; // MIN_TARGET = 10_000_000 stroops = 1.0 token
const MAX_DURATION_DAYS = 365; // MAX_DURATION = 31_536_000 sec
const MAX_METADATA_URI_LEN = 256; // MAX_METADATA_URI_LEN

// Client-side cap on payout recipients — the contract has no limit, but every
// beneficiary adds a token transfer to the claim, so keep claims affordable.
const MAX_BENEFICIARIES = 10;

// Tags constraints (client-side only — not enforced on-chain).
const MAX_TAG_COUNT = 10;
const MAX_TAG_LENGTH = 30;

const SHARE_FORMAT_MESSAGE = "Enter a percentage with up to 2 decimals";

const baseSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(MAX_TITLE_LEN, `Title cannot exceed ${MAX_TITLE_LEN} characters`),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(500, "Description cannot exceed 500 characters"),
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
const formSchema = baseSchema.superRefine((values, ctx) => {
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

type FormValues = z.infer<typeof baseSchema>;

/** Payout split in the contract's basis-point form; the primary gets 100% when alone. */
function buildBeneficiaries(values: Partial<FormValues>): { address: string; share: number }[] {
  const extras = values.extraBeneficiaries ?? [];
  if (extras.length === 0) {
    return values.beneficiary ? [{ address: values.beneficiary, share: TOTAL_SHARE_BPS }] : [];
  }
  return [
    { address: values.beneficiary ?? "", share: percentToBps(values.beneficiaryShare ?? "") ?? 0 },
    ...extras.map((b) => ({ address: b.address, share: percentToBps(b.share) ?? 0 })),
  ];
}

/** Build a synthetic Campaign object from current form values for preview. */
function calculateDeadlineTimestamp(deadlineDaysStr: string): number {
  return Math.floor(Date.now() / 1000) + parseInt(deadlineDaysStr, 10) * 24 * 60 * 60;
}

function buildPreviewCampaign(
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
    beneficiaries: buildBeneficiaries(values),
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
    max_per_donor:
      values.maxPerDonor && Number(values.maxPerDonor) > 0
        ? BigInt(Math.round(Number(values.maxPerDonor) * 10_000_000))
        : undefined,
    tags,
  };
}

export function CreateCampaignForm({ inline = false }: { inline?: boolean }) {
  const { isWrongNetwork, address: walletAddress } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const createCampaign = useCreateCampaign();

  // --- Tags state (#848) ---
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);

  // --- Preview toggle (#847) ---
  const [showPreview, setShowPreview] = useState(false);

  const [step, setStep] = useState(1);
  const totalSteps = 3;

  const STEP_FIELDS: Record<number, Path<FormValues>[]> = {
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

  const nextStep = async () => {
    const fieldsToValidate = STEP_FIELDS[step] || [];
    const isValid = await form.trigger(fieldsToValidate);
    // The share-total issue lives on a virtual path, so trigger() never
    // reports it; check it explicitly before leaving the Funding step.
    if (isValid && !(step === 2 && sharesTotalError)) {
      setStep((s) => Math.min(s + 1, totalSteps));
    }
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Live validation so character counters, range errors, and the
    // submit-disabled state all update on every keystroke instead of
    // only after the user attempts to submit.
    mode: "onChange",
    defaultValues: {
      title: "",
      description: "",
      beneficiary: "",
      beneficiaryShare: "100",
      extraBeneficiaries: [],
      maxPerDonor: "",
      category: "",
      targetAmount: "",
      deadlineDays: "30",
      acceptedToken: NATIVE_XLM_CONTRACT_ID,
      website: "",
      twitter: "",
      metadataUri: "",
    },
  });

  const extraBeneficiaryFields = useFieldArray({
    control: form.control,
    name: "extraBeneficiaries",
  });

  // Restore draft from sessionStorage and trigger validation once on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("create_campaign_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        Object.entries(draft).forEach(([key, val]) => {
          if (key === "tags" && Array.isArray(val)) {
            setTags(val as string[]);
          } else if (val !== undefined && typeof val === "string") {
            form.setValue(key as Path<FormValues>, val as string, { shouldDirty: true });
          }
        });
      } catch (e) {
        console.error("Failed to restore campaign draft", e);
      }
    }
    void form.trigger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save form draft to sessionStorage as user types
  const formValues = form.watch();
  const debouncedValues = useDebouncedValue(formValues, 500);

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    // Only persist real edits. Without this, the debounced save re-writes the
    // blank form right after a successful submit clears the draft.
    if (!isDirty && tags.length === 0) {
      sessionStorage.removeItem("create_campaign_draft");
      return;
    }
    // Payout addresses are never persisted, so a stale draft can't silently
    // route funds to the wrong account.
    const { beneficiary, beneficiaryShare, extraBeneficiaries, ...draftToSave } = debouncedValues;
    sessionStorage.setItem("create_campaign_draft", JSON.stringify({ ...draftToSave, tags }));
  }, [debouncedValues, tags, isDirty]);

  const watchBeneficiary = form.watch("beneficiary") ?? "";
  const debouncedBeneficiary = useDebouncedValue(watchBeneficiary, 500);
  const isBeneficiaryValid = isValidStellarAddress(debouncedBeneficiary);
  const { data: resolvedBeneficiaryName, isFetching: isResolvingBeneficiary } = useResolvedName(
    isBeneficiaryValid ? debouncedBeneficiary : null,
  );

  const watchAcceptedToken = form.watch("acceptedToken");
  const metadataUri = form.watch("metadataUri") ?? "";
  const watchedTitle = form.watch("title") ?? "";
  const titleLen = watchedTitle.length;
  const metadataUriLen = metadataUri.length;
  const selectedTokenMeta = PREDEFINED_TOKENS.find((t) => t.address === watchAcceptedToken);
  const tokenSymbol = selectedTokenMeta ? selectedTokenMeta.symbol : "Tokens";

  const watchedExtraBeneficiaries = form.watch("extraBeneficiaries") ?? [];
  const hasMultipleBeneficiaries = watchedExtraBeneficiaries.length > 0;
  const payoutSplit = buildBeneficiaries(formValues);
  const sharesTotalBps = payoutSplit.reduce((sum, b) => sum + b.share, 0);
  const sharesTotalError = hasMultipleBeneficiaries && sharesTotalBps !== TOTAL_SHARE_BPS;
  const formatPercent = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
  const watchedMaxPerDonor = form.watch("maxPerDonor") ?? "";

  function addBeneficiary() {
    if (watchedExtraBeneficiaries.length + 1 >= MAX_BENEFICIARIES) return;
    // Pre-fill whatever share is still unallocated so the split stays at 100%
    // when the creator is just carving out a slice.
    const remainingBps = Math.max(0, TOTAL_SHARE_BPS - sharesTotalBps);
    extraBeneficiaryFields.append({
      address: "",
      share: remainingBps > 0 ? (remainingBps / 100).toString() : "",
    });
  }

  function removeBeneficiary(index: number) {
    extraBeneficiaryFields.remove(index);
    // Back to a single beneficiary: they receive everything again.
    if (watchedExtraBeneficiaries.length === 1) {
      form.setValue("beneficiaryShare", "100", { shouldValidate: true });
    }
  }

  // Build preview campaign from current form values (updated live)
  const previewCampaign = buildPreviewCampaign(formValues, tags, walletAddress ?? "");

  // --- Tag helpers ---
  function commitTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag) return;
    if (tags.length >= MAX_TAG_COUNT) {
      setTagError(`Maximum ${MAX_TAG_COUNT} tags allowed.`);
      return;
    }
    if (tag.length > MAX_TAG_LENGTH) {
      setTagError(`Tag must be ${MAX_TAG_LENGTH} characters or fewer.`);
      return;
    }
    if (tags.includes(tag)) {
      setTagError("Tag already added.");
      return;
    }
    setTags((prev) => [...prev, tag]);
    setTagInput("");
    setTagError("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
    setTagError("");
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  async function onSubmit(values: FormValues) {
    if (createCampaign.isPending || isUploadingImage) return; // Prevent duplicate submissions

    try {
      const deadline = calculateDeadlineTimestamp(values.deadlineDays);
      const result = await createCampaign.mutateAsync({
        title: values.title,
        description: values.description,
        beneficiary: values.beneficiary,
        beneficiaries: buildBeneficiaries(values),
        category: values.category || "other",
        metadataUri: values.metadataUri || undefined,
        targetAmount: values.targetAmount,
        deadline,
        acceptedToken: values.acceptedToken,
        website: values.website || undefined,
        twitter: values.twitter || undefined,
        maxPerDonor: values.maxPerDonor?.trim() || null,
      });
      sessionStorage.removeItem("create_campaign_draft");
      setIsOpen(false);
      form.reset();
      setSelectedFileName("");
      setStep(1);
      setTags([]);
      setTagInput("");
      const campaignId =
        (result as { campaignId?: string | number } | undefined)?.campaignId ?? "1";
      router.push(`/campaign/${campaignId}`);
      setUploadError("");
      setUploadProgress(0);
    } catch (e: unknown) {
      // Errors are already handled/displayed by the sonner toast inside the useCreateCampaign hook mutation wrapper,
      // but we catch it here to prevent uncaught promise rejections.
      console.error(e);
    }
  }

  async function uploadImage(file: File) {
    setUploadError("");
    setIsUploadingImage(true);
    setUploadProgress(0);

    const data = new FormData();
    data.append("file", file);

    const response = await new Promise<{ metadata_uri: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/ipfs-upload");

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      };

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error("Upload failed. Please try again."));
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Unexpected upload response."));
        }
      };

      xhr.onerror = () => reject(new Error("Network error while uploading image."));
      xhr.send(data);
    });

    form.setValue("metadataUri", response.metadata_uri, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setUploadProgress(100);
    setIsUploadingImage(false);
  }

  async function onImageSelected(file: File | null) {
    setUploadError("");
    if (!file) {
      setSelectedFileName("");
      form.setValue("metadataUri", "");
      return;
    }
    const isImage =
      file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg";
    if (!isImage) {
      setUploadError("Only PNG or JPG images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be 5MB or less.");
      return;
    }
    setSelectedFileName(file.name);
    try {
      await uploadImage(file);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upload image.";
      setUploadError(message);
      form.setValue("metadataUri", "", { shouldValidate: true, shouldDirty: true });
      setIsUploadingImage(false);
      setUploadProgress(0);
    }
  }

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Step {step} of {totalSteps}
            </span>
            <span>{step === 1 ? "Details" : step === 2 ? "Funding" : "Review"}</span>
          </div>
          <Progress
            value={(step / totalSteps) * 100}
            className="h-2"
            aria-label={`Campaign setup progress: step ${step} of ${totalSteps}`}
          />
        </div>

        {/* Responsive layout: form steps on left, live CampaignCard preview alongside on right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6 items-start">
          <div className="space-y-4">
            {/* Step 1: Details */}
            <div className={cn("space-y-4", step !== 1 && "hidden")}>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Campaign Title</FormLabel>
                      <span
                        aria-live="polite"
                        className={cn(
                          "text-xs tabular-nums",
                          titleLen > MAX_TITLE_LEN ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {titleLen}/{MAX_TITLE_LEN}
                      </span>
                    </div>
                    <FormControl>
                      <Input
                        placeholder="Flood Relief 2024"
                        maxLength={MAX_TITLE_LEN}
                        {...field}
                        disabled={createCampaign.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => {
                  const descValue = field.value ?? "";
                  const descLength = descValue.length;
                  const remaining = 500 - descLength;
                  const isWarning = remaining < 20 && descLength <= 500;
                  const isOverLimit = descLength > 500;

                  return (
                    <FormItem>
                      <FormLabel>Campaign Description</FormLabel>
                      <FormControl>
                        <textarea
                          placeholder="Provide a detailed description of the campaign..."
                          rows={3}
                          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                          {...field}
                          disabled={createCampaign.isPending}
                        />
                      </FormControl>
                      <div className="flex items-center justify-between text-xs">
                        <FormMessage />
                        <span
                          aria-live="polite"
                          className={cn(
                            "tabular-nums transition-colors ml-auto",
                            isOverLimit
                              ? "text-destructive font-semibold"
                              : isWarning
                                ? "text-amber-600 dark:text-amber-400 font-medium"
                                : "text-muted-foreground",
                          )}
                        >
                          {descLength} / 500 characters
                        </span>
                      </div>
                    </FormItem>
                  );
                }}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (Optional)</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        {...field}
                        disabled={createCampaign.isPending}
                      >
                        <option value="">Select Category</option>
                        <option value="medical">Medical</option>
                        <option value="food">Food</option>
                        <option value="shelter">Shelter</option>
                        <option value="education">Education</option>
                        <option value="relief">Relief</option>
                        <option value="other">Other</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tags input (#848) */}
              <FormItem>
                <FormLabel htmlFor="campaign-tags-input">
                  Tags{" "}
                  <span className="text-muted-foreground font-normal text-xs">
                    (Optional · up to {MAX_TAG_COUNT})
                  </span>
                </FormLabel>
                <div
                  className={cn(
                    "flex flex-wrap gap-1.5 min-h-[42px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    createCampaign.isPending && "opacity-50 cursor-not-allowed",
                  )}
                  onClick={() => tagInputRef.current?.focus()}
                >
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                      <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                      {tag}
                      <button
                        type="button"
                        aria-label={`Remove tag ${tag}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTag(tag);
                        }}
                        className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                        disabled={createCampaign.isPending}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="campaign-tags-input"
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    onChange={(e) => {
                      setTagError("");
                      setTagInput(e.target.value);
                    }}
                    onKeyDown={handleTagKeyDown}
                    onBlur={() => {
                      if (tagInput.trim()) commitTag(tagInput);
                    }}
                    placeholder={tags.length === 0 ? "Type a tag and press Enter or comma…" : ""}
                    disabled={createCampaign.isPending || tags.length >= MAX_TAG_COUNT}
                    className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm disabled:cursor-not-allowed"
                    aria-describedby={tagError ? "campaign-tags-error" : "campaign-tags-hint"}
                  />
                </div>
                {tagError ? (
                  <p
                    id="campaign-tags-error"
                    className="text-xs text-destructive mt-1"
                    role="alert"
                  >
                    {tagError}
                  </p>
                ) : (
                  <p id="campaign-tags-hint" className="text-xs text-muted-foreground mt-1">
                    Press{" "}
                    <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono">Enter</kbd> or{" "}
                    <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono">,</kbd> to add
                    · max {MAX_TAG_LENGTH} chars per tag · {MAX_TAG_COUNT - tags.length} remaining
                  </p>
                )}
              </FormItem>

              <FormField
                control={form.control}
                name="metadataUri"
                render={() => (
                  <FormItem>
                    <FormLabel>Campaign Cover Image (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept="image/png,image/jpeg"
                        disabled={createCampaign.isPending || isUploadingImage}
                        onChange={(event) => void onImageSelected(event.target.files?.[0] ?? null)}
                      />
                    </FormControl>
                    <FormDescription>
                      Upload PNG/JPG image up to 5MB. This will be stored on IPFS.
                    </FormDescription>
                    {isUploadingImage && (
                      <div className="space-y-1">
                        <Progress value={uploadProgress} aria-label="Image upload progress" />
                        <p className="text-xs text-muted-foreground">
                          Uploading... {uploadProgress}%
                        </p>
                      </div>
                    )}
                    {selectedFileName && !uploadError && (
                      <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p>
                    )}
                    {!!metadataUri && !uploadError && (
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-muted-foreground break-all">
                          CID: {metadataUri}
                        </p>
                        <span
                          aria-live="polite"
                          className={cn(
                            "text-xs tabular-nums shrink-0",
                            metadataUriLen > MAX_METADATA_URI_LEN
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {metadataUriLen}/{MAX_METADATA_URI_LEN}
                        </span>
                      </div>
                    )}
                    {!!uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://myrelief.org"
                        {...field}
                        disabled={createCampaign.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="twitter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twitter Link (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://twitter.com/mycampaign"
                        {...field}
                        disabled={createCampaign.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Step 2: Funding */}
            <div className={cn("space-y-4", step !== 2 && "hidden")}>
              <FormField
                control={form.control}
                name="beneficiary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {hasMultipleBeneficiaries ? "Beneficiary 1 Address" : "Beneficiary Address"}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="G..." {...field} disabled={createCampaign.isPending} />
                    </FormControl>
                    <FormDescription>Stellar public key of the receiver.</FormDescription>
                    {isBeneficiaryValid && (
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {isResolvingBeneficiary
                          ? "Resolving name…"
                          : resolvedBeneficiaryName
                            ? `Resolved: ${resolvedBeneficiaryName}`
                            : null}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {hasMultipleBeneficiaries && (
                <FormField
                  control={form.control}
                  name="beneficiaryShare"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beneficiary 1 Share (%)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="50"
                          {...field}
                          disabled={createCampaign.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {extraBeneficiaryFields.fields.map((item, index) => (
                <div key={item.id} className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Beneficiary {index + 2}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      aria-label={`Remove beneficiary ${index + 2}`}
                      onClick={() => removeBeneficiary(index)}
                      disabled={createCampaign.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[1fr,7rem] gap-3">
                    <FormField
                      control={form.control}
                      name={`extraBeneficiaries.${index}.address`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={`G... (beneficiary ${index + 2})`}
                              {...field}
                              disabled={createCampaign.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`extraBeneficiaries.${index}.share`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Share (%)</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="decimal"
                              placeholder="50"
                              {...field}
                              disabled={createCampaign.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={addBeneficiary}
                  disabled={
                    createCampaign.isPending ||
                    watchedExtraBeneficiaries.length + 1 >= MAX_BENEFICIARIES
                  }
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> Add beneficiary
                </Button>
                {hasMultipleBeneficiaries && (
                  <p
                    aria-live="polite"
                    className={cn(
                      "text-xs tabular-nums",
                      sharesTotalError ? "text-destructive font-medium" : "text-muted-foreground",
                    )}
                  >
                    Total: {formatPercent(sharesTotalBps)} of 100%
                  </p>
                )}
              </div>
              {sharesTotalError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {INVALID_SHARES_MESSAGE} Currently {formatPercent(sharesTotalBps)}.
                </p>
              )}

              <FormField
                control={form.control}
                name="acceptedToken"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <TokenSelector value={field.value} onChange={(val) => field.onChange(val)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="targetAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target ({tokenSymbol})</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={MIN_TARGET_TOKEN}
                          step="0.0000001"
                          placeholder="1000"
                          {...field}
                          disabled={createCampaign.isPending}
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        Min {MIN_TARGET_TOKEN.toFixed(1)} {tokenSymbol}.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deadlineDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (Days)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_DURATION_DAYS}
                          {...field}
                          disabled={createCampaign.isPending}
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        1–{MAX_DURATION_DAYS} days.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="maxPerDonor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum per donor ({tokenSymbol}, Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="0.0000001"
                        placeholder="No cap"
                        {...field}
                        disabled={createCampaign.isPending}
                      />
                    </FormControl>
                    <FormDescription className="text-[11px]">
                      Limits how much a single wallet can contribute in total. Leave empty for no
                      cap.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Step 3: Review */}
            <div className={cn("space-y-4 text-sm", step !== 3 && "hidden")}>
              <div className="rounded-md bg-muted p-4 space-y-3">
                <div>
                  <p className="text-muted-foreground text-xs">Title</p>
                  <p className="font-medium">{watchedTitle || "N/A"}</p>
                </div>
                {hasMultipleBeneficiaries ? (
                  <div>
                    <p className="text-muted-foreground text-xs">Beneficiaries</p>
                    <ul className="space-y-1">
                      {payoutSplit.map((b, i) => (
                        <li key={i} className="flex items-start justify-between gap-3">
                          <span className="font-medium break-all">{b.address || "N/A"}</span>
                          <span className="font-medium tabular-nums shrink-0">
                            {formatPercent(b.share)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div>
                    <p className="text-muted-foreground text-xs">Beneficiary</p>
                    <p className="font-medium break-all">{form.watch("beneficiary") || "N/A"}</p>
                    {resolvedBeneficiaryName && (
                      <p className="text-xs text-muted-foreground">{resolvedBeneficiaryName}</p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Target</p>
                    <p className="font-medium">
                      {form.watch("targetAmount") || "0"} {tokenSymbol}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Duration</p>
                    <p className="font-medium">{form.watch("deadlineDays") || "0"} Days</p>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Maximum per donor</p>
                  <p className="font-medium">
                    {watchedMaxPerDonor.trim() ? `${watchedMaxPerDonor} ${tokenSymbol}` : "No cap"}
                  </p>
                </div>
                {tags.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-xs mb-1">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary"
                        >
                          <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3 Live Preview toggle (#847) for mobile / quick review */}
              <div className="lg:hidden space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  aria-expanded={showPreview}
                  aria-controls="campaign-preview-panel"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  {showPreview ? "Hide preview" : "Show card preview"}
                </button>
                {showPreview && (
                  <div
                    id="campaign-preview-panel"
                    aria-label="Live campaign card preview"
                    className="max-w-sm"
                  >
                    <p className="text-xs text-muted-foreground mb-2">
                      This is how your campaign card will look to donors.
                    </p>
                    <CampaignCard campaign={previewCampaign} isPreview />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={prevStep} className="w-1/3">
                  Back
                </Button>
              )}
              {step < totalSteps ? (
                <Button type="button" onClick={nextStep} className={step > 1 ? "w-2/3" : "w-full"}>
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  className={step > 1 ? "w-2/3" : "w-full"}
                  disabled={
                    createCampaign.isPending ||
                    isUploadingImage ||
                    !form.formState.isValid ||
                    (form.watch("description")?.length ?? 0) > 500
                  }
                >
                  {createCampaign.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : isUploadingImage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Launch Campaign"
                  )}
                </Button>
              )}
            </div>

            {/* Mobile preview toggle for step 1 & 2 (#847) */}
            {step !== 3 && (
              <div className="lg:hidden pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                  aria-expanded={showPreview}
                  aria-controls="mobile-live-preview"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {showPreview ? "Hide card preview" : "Show live card preview"}
                </button>
                {showPreview && (
                  <div
                    id="mobile-live-preview"
                    aria-label="Live campaign card preview"
                    className="mt-3 max-w-[340px] mx-auto border rounded-xl p-3 bg-muted/20"
                  >
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Live preview reflects current form input in real time.
                    </p>
                    <CampaignCard campaign={previewCampaign} isPreview />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Desktop Live Preview (#847): persistent alongside form across all steps */}
          <aside
            className="hidden lg:flex flex-col space-y-2 sticky top-0"
            aria-label="Live campaign card preview"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-primary" aria-hidden="true" /> Live Card Preview
              </span>
              <span className="text-[10px] text-muted-foreground">Updates live</span>
            </div>
            <div className="w-full max-w-[340px] border rounded-xl p-3 bg-muted/20 shadow-sm">
              <CampaignCard campaign={previewCampaign} isPreview />
            </div>
          </aside>
        </div>
      </form>
    </Form>
  );

  if (inline) {
    return <div className="space-y-4">{formContent}</div>;
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!createCampaign.isPending) {
          if (!open) {
            setSelectedFileName("");
            setUploadError("");
            setUploadProgress(0);
            setIsUploadingImage(false);
            setStep(1);
          }
          setIsOpen(open);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="gap-2"
          disabled={isWrongNetwork}
          title={isWrongNetwork ? "Switch to the correct network to create a campaign" : undefined}
        >
          <PlusCircle className="w-4 h-4" /> Start a Campaign
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[520px] lg:max-w-4xl max-h-[90vh] overflow-y-auto"
        aria-labelledby="create-campaign-dialog-title"
        onPointerDownOutside={(e) => {
          if (createCampaign.isPending) e.preventDefault(); // lock UI until resolution
        }}
        onEscapeKeyDown={(e) => {
          if (createCampaign.isPending) e.preventDefault(); // lock UI until resolution
        }}
      >
        <DialogHeader>
          <DialogTitle id="create-campaign-dialog-title">Create Relief Campaign</DialogTitle>
          <DialogDescription>
            Fill in the details for your relief grant. Ensure the beneficiary address is correct.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
