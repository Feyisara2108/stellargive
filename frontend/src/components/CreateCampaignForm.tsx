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
});

const NATIVE_XLM = "CDLZS3ZCDY7SF3SIVR6Y7I6SN636O27T7G5MKSUIU22ZS76E55WJIPZ4";

export function CreateCampaignForm() {
  const [isOpen, setIsOpen] = useState(false);
  const createCampaign = useCreateCampaign();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      beneficiary: "",
      targetAmount: "",
      deadlineDays: "30",
      acceptedToken: NATIVE_XLM,
      website: "",
      twitter: "",
    },
  });

  const watchAcceptedToken = form.watch("acceptedToken");
  const selectedTokenMeta = PREDEFINED_TOKENS.find(t => t.address === watchAcceptedToken);
  const tokenSymbol = selectedTokenMeta ? selectedTokenMeta.symbol : "Tokens";

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (createCampaign.isPending) return; // Prevent duplicate submissions

    try {
      const deadline = Math.floor(Date.now() / 1000) + parseInt(values.deadlineDays) * 24 * 60 * 60;
      await createCampaign.mutateAsync({
        title: values.title,
        beneficiary: values.beneficiary,
        targetAmount: values.targetAmount,
        deadline,
        acceptedToken: values.acceptedToken,
        website: values.website || undefined,
        twitter: values.twitter || undefined,
      });
      setIsOpen(false);
      form.reset();
    } catch (e: any) {
      // Errors are already handled/displayed by the sonner toast inside the useCreateCampaign hook mutation wrapper,
      // but we catch it here to prevent uncaught promise rejections.
      console.error(e);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!createCampaign.isPending) {
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
            <Button type="submit" className="w-full" disabled={createCampaign.isPending}>
              {createCampaign.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Campaign...
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
