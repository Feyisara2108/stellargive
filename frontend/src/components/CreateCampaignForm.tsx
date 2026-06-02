"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCreateCampaign } from "@/hooks/useSoroban";
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
import { useState } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import { TokenSelector, PREDEFINED_TOKENS } from "@/components/TokenSelector";

const formSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(50, "Title cannot exceed 50 characters"),
  beneficiary: z.string().regex(/^G[A-Z0-9]{55}$/, "Invalid Stellar address"),
  category: z.enum(["medical", "food", "shelter", "education", "relief", "other"]),
  targetAmount: z.string().refine(
    (val) => !isNaN(Number(val)) && Number(val) > 0,
    "Target amount must be a positive number"
  ),
  deadlineDays: z.string().refine(
    (val) => {
      const n = Number(val);
      return Number.isInteger(n) && n >= 1;
    },
    "Deadline must be at least 1 day (24 hours) in the future"
  ),
  acceptedToken: z.string().regex(/^C[A-Z0-9]{55}$|^G[A-Z0-9]{55}$/, "Invalid Token address"),
  website: z
    .string()
    .optional()
    .refine((val) => !val || val.trim() === "" || val.startsWith("https://"), "Website URL must start with https://"),
  twitter: z
    .string()
    .optional()
    .refine((val) => !val || val.trim() === "" || val.startsWith("https://"), "Twitter URL must start with https://"),
  metadataUri: z
    .string()
    .optional()
    .refine((val) => !val || val.startsWith("ipfs://") || val.startsWith("https://"), "Metadata URI must start with ipfs:// or https://"),
});

const NATIVE_XLM = "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4";

export function CreateCampaignForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const createCampaign = useCreateCampaign();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
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

  const watchAcceptedToken = form.watch("acceptedToken");
  const metadataUri = form.watch("metadataUri");
  const selectedTokenMeta = PREDEFINED_TOKENS.find(t => t.address === watchAcceptedToken);
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

    form.setValue("metadataUri", response.metadata_uri, { shouldValidate: true, shouldDirty: true });
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
    const isImage = file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/jpg";
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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!createCampaign.isPending) {
        if (!open) {
          setSelectedFileName("");
          setUploadError("");
          setUploadProgress(0);
          setIsUploadingImage(false);
        }
        setIsOpen(open);
      }
    }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <PlusCircle className="w-4 h-4" /> Start a Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => {
        if (createCampaign.isPending) e.preventDefault(); // lock UI until resolution
      }} onEscapeKeyDown={(e) => {
        if (createCampaign.isPending) e.preventDefault(); // lock UI until resolution
      }}>
        <DialogHeader>
          <DialogTitle>Create Relief Campaign</DialogTitle>
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
                  <FormLabel>Campaign Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Flood Relief 2024" {...field} disabled={createCampaign.isPending} />
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
                    <TokenSelector
                      value={field.value}
                      onChange={(val) => field.onChange(val)}
                    />
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
                      <Input type="number" placeholder="1000" {...field} disabled={createCampaign.isPending} />
                    </FormControl>
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
                      <Input type="number" {...field} disabled={createCampaign.isPending} />
                    </FormControl>
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
                      <p className="text-xs text-muted-foreground">Uploading... {uploadProgress}%</p>
                    </div>
                  )}
                  {selectedFileName && !uploadError && (
                    <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p>
                  )}
                  {!!metadataUri && !uploadError && (
                    <p className="text-xs text-muted-foreground break-all">CID: {metadataUri}</p>
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
                    <Input placeholder="https://myrelief.org" {...field} disabled={createCampaign.isPending} />
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
                    <Input placeholder="https://twitter.com/mycampaign" {...field} disabled={createCampaign.isPending} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={createCampaign.isPending || isUploadingImage}>
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
