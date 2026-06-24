"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { useEffect, useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { TokenSelector, PREDEFINED_TOKENS } from "@/components/TokenSelector";
import { cn } from "@/lib/utils";

// Contract-enforced bounds — keep in sync with
// contracts/stellar-give/src/lib.rs constants. Surfacing them at the form
// layer prevents users from spending gas on a simulation that the chain
// will reject for a value we could have rejected locally.
const MAX_TITLE_LEN = 50; // MAX_TITLE_LEN
const MIN_TARGET_TOKEN = 1; // MIN_TARGET = 10_000_000 stroops = 1.0 token
const MAX_DURATION_DAYS = 365; // MAX_DURATION = 31_536_000 sec
const MAX_METADATA_URI_LEN = 256; // MAX_METADATA_URI_LEN

const formSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(MAX_TITLE_LEN, `Title cannot exceed ${MAX_TITLE_LEN} characters`),
  beneficiary: z.string().regex(/^G[A-Z0-9]{55}$/, "Invalid Stellar address"),
  category: z.enum(["medical", "food", "shelter", "education", "relief", "other"]),
  targetAmount: z.string().refine((val) => {
    const n = Number(val);
    return !isNaN(n) && n >= MIN_TARGET_TOKEN;
  }, `Target must be at least ${MIN_TARGET_TOKEN.toFixed(1)} (the contract's minimum)`),
  deadlineDays: z.string().refine((val) => {
    const n = Number(val);
    return Number.isInteger(n) && n >= 1 && n <= MAX_DURATION_DAYS;
  }, `Deadline must be between 1 and ${MAX_DURATION_DAYS} days`),
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

const NATIVE_XLM = "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4";

export function CreateCampaignForm() {
  const { isWrongNetwork } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const createCampaign = useCreateCampaign();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    // Live validation so character counters, range errors, and the
    // submit-disabled state all update on every keystroke instead of
    // only after the user attempts to submit.
    mode: "onChange",
    defaultValues: {
      title: "",
      beneficiary: "",
      category: "relief",
      targetAmount: "",
      deadlineDays: "30",
      acceptedToken: NATIVE_XLM,
      website: "",
      twitter: "",
      metadataUri: "",
    },
  });

  // Trigger validation once on mount so `formState.isValid` reflects the
  // schema applied to the initial values (otherwise it stays optimistically
  // `true` until the user edits any field, which would briefly render an
  // enabled submit button on top of invalid defaults).
  useEffect(() => {
    void form.trigger();
    // form is stable across renders for our purposes; we only want this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watchAcceptedToken = form.watch("acceptedToken");
  const metadataUri = form.watch("metadataUri") ?? "";
  const watchedTitle = form.watch("title") ?? "";
  const titleLen = watchedTitle.length;
  const metadataUriLen = metadataUri.length;
  const selectedTokenMeta = PREDEFINED_TOKENS.find((t) => t.address === watchAcceptedToken);
  const tokenSymbol = selectedTokenMeta ? selectedTokenMeta.symbol : "Tokens";

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (createCampaign.isPending || isUploadingImage) return; // Prevent duplicate submissions

    try {
      const deadline = Math.floor(Date.now() / 1000) + parseInt(values.deadlineDays) * 24 * 60 * 60;
      await createCampaign.mutateAsync({
        title: values.title,
        beneficiary: values.beneficiary,
        category: values.category,
        metadataUri: values.metadataUri || undefined,
        targetAmount: values.targetAmount,
        deadline,
        acceptedToken: values.acceptedToken,
        website: values.website || undefined,
        twitter: values.twitter || undefined,
      });
      setIsOpen(false);
      form.reset();
      setSelectedFileName("");
      setUploadError("");
      setUploadProgress(0);
    } catch (e: any) {
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
          }
          setIsOpen(open);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2" disabled={isWrongNetwork} title={isWrongNetwork ? "Switch to the correct network to create a campaign" : undefined}>
          <PlusCircle className="w-4 h-4" /> Start a Campaign
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-[425px]"
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        titleLen > MAX_TITLE_LEN
                          ? "text-destructive"
                          : "text-muted-foreground",
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
              name="beneficiary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beneficiary Address</FormLabel>
                  <FormControl>
                    <Input placeholder="G..." {...field} disabled={createCampaign.isPending} />
                  </FormControl>
                  <FormDescription>Stellar public key of the receiver.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
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
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      {...field}
                      disabled={createCampaign.isPending}
                    >
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
                      <p className="text-xs text-muted-foreground break-all">CID: {metadataUri}</p>
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
            <Button
              type="submit"
              className="w-full"
              disabled={
                createCampaign.isPending ||
                isUploadingImage ||
                !form.formState.isValid
              }
            >
              {createCampaign.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Campaign...
                </>
              ) : isUploadingImage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading Image...
                </>
              ) : (
                "Launch Campaign"
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
