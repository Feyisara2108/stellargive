"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateCampaign } from "@/hooks/useSoroban";
import { useWallet } from "@/lib/WalletProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle } from "lucide-react";
import { PREDEFINED_TOKENS } from "@/components/TokenSelector";
import {
  DEFAULT_VALUES,
  MAX_DESCRIPTION_LEN,
  STEP_FIELDS,
  STEP_LABELS,
  TOTAL_STEPS,
  buildPreviewCampaign,
  calculateDeadlineTimestamp,
  formSchema,
  type FormValues,
} from "@/components/create-campaign/schema";
import { DetailsStep } from "@/components/create-campaign/DetailsStep";
import { FundingStep } from "@/components/create-campaign/FundingStep";
import { ReviewStep } from "@/components/create-campaign/ReviewStep";
import {
  DesktopLivePreview,
  MobileLivePreview,
} from "@/components/create-campaign/CampaignPreview";
import {
  clearCampaignDraft,
  useCampaignDraft,
} from "@/components/create-campaign/useCampaignDraft";
import { useCampaignTags } from "@/components/create-campaign/useCampaignTags";
import { useImageUpload } from "@/components/create-campaign/useImageUpload";
import { useBeneficiaryName } from "@/components/create-campaign/useBeneficiaryName";

export function CreateCampaignForm({ inline = false }: { inline?: boolean }) {
  const { isWrongNetwork, address: walletAddress } = useWallet();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const createCampaign = useCreateCampaign();

  // --- Preview toggle (#847) ---
  const [showPreview, setShowPreview] = useState(false);
  const togglePreview = () => setShowPreview((v) => !v);

  const [step, setStep] = useState(1);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    // Live validation so character counters, range errors, and the
    // submit-disabled state all update on every keystroke instead of
    // only after the user attempts to submit.
    mode: "onChange",
    defaultValues: DEFAULT_VALUES,
  });

  const tags = useCampaignTags();
  const upload = useImageUpload(form);
  const beneficiary = useBeneficiaryName(form);
  const formValues = useCampaignDraft(form, tags.tags, tags.setTags);

  const nextStep = async () => {
    const fieldsToValidate = STEP_FIELDS[step] || [];
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const selectedTokenMeta = PREDEFINED_TOKENS.find((t) => t.address === formValues.acceptedToken);
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
  const previewCampaign = buildPreviewCampaign(formValues, tags.tags, walletAddress ?? "");

  async function onSubmit(values: FormValues) {
    if (createCampaign.isPending || upload.isUploadingImage) return; // Prevent duplicate submissions

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
      clearCampaignDraft();
      setIsOpen(false);
      form.reset();
      setStep(1);
      tags.reset();
      upload.reset();
      const campaignId =
        (result as { campaignId?: string | number } | undefined)?.campaignId ?? "1";
      router.push(`/campaign/${campaignId}`);
    } catch (e: unknown) {
      // Errors are already handled/displayed by the sonner toast inside the useCreateCampaign hook mutation wrapper,
      // but we catch it here to prevent uncaught promise rejections.
      console.error(e);
    }
  }

  const formContent = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Step {step} of {TOTAL_STEPS}
            </span>
            <span>{STEP_LABELS[step]}</span>
          </div>
          <Progress
            value={(step / TOTAL_STEPS) * 100}
            className="h-2"
            aria-label={`Campaign setup progress: step ${step} of ${TOTAL_STEPS}`}
          />
        </div>

        {/* Responsive layout: form steps on left, live CampaignCard preview alongside on right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-6 items-start">
          <div className="space-y-4">
            <DetailsStep
              active={step === 1}
              disabled={createCampaign.isPending}
              tags={tags}
              upload={upload}
            />
            <FundingStep
              active={step === 2}
              disabled={createCampaign.isPending}
              tokenSymbol={tokenSymbol}
              beneficiary={beneficiary}
            />
            <ReviewStep
              active={step === 3}
              tokenSymbol={tokenSymbol}
              resolvedBeneficiaryName={beneficiary.resolvedBeneficiaryName}
              tags={tags.tags}
              previewCampaign={previewCampaign}
              showPreview={showPreview}
              onTogglePreview={togglePreview}
            />

            <div className="flex gap-2 pt-4">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={prevStep} className="w-1/3">
                  Back
                </Button>
              )}
              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={nextStep} className={step > 1 ? "w-2/3" : "w-full"}>
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  className={step > 1 ? "w-2/3" : "w-full"}
                  disabled={
                    createCampaign.isPending ||
                    upload.isUploadingImage ||
                    !form.formState.isValid ||
                    (formValues.description?.length ?? 0) > MAX_DESCRIPTION_LEN
                  }
                >
                  {createCampaign.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : upload.isUploadingImage ? (
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

            {step !== 3 && (
              <MobileLivePreview
                campaign={previewCampaign}
                open={showPreview}
                onToggle={togglePreview}
              />
            )}
          </div>

          <DesktopLivePreview campaign={previewCampaign} />
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
            upload.reset();
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
