"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Share2, Twitter, Copy, Check, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

// We only need the ID and title from the campaign for sharing.
// Doing a loose type helps us use it anywhere without full Campaign type requirement.
interface ShareableCampaign {
  id: bigint;
  title: string;
}

export function ShareButton({ campaign }: { campaign: ShareableCampaign }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const getShareUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/campaign/${campaign.id.toString()}`;
    }
    return "";
  };

  const handleCopy = async () => {
    const url = getShareUrl();
    if (!url) {
      toast.error("Unable to determine URL");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied!");
      if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopied(false);
      }, 2000);
    } catch (err) {
      logger.error("Failed to copy link:", err);
      toast.error("Unable to copy link");
    }
  };

  const openShare = (buildUrl: (url: string, text: string) => string) => {
    const url = getShareUrl();
    if (!url) return;
    const text = `Check out "${campaign.title}" on StellarGive`;
    window.open(buildUrl(url, text), "_blank", "noopener,noreferrer");
  };

  const handleTwitterShare = () =>
    openShare(
      (url, text) =>
        `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    );

  const handleTelegramShare = () =>
    openShare(
      (url, text) =>
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    );

  const handleWhatsAppShare = () =>
    openShare(
      (url, text) =>
        `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}: ${url}`)}`,
    );

  const handleShareClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const url = getShareUrl();
    if (!url) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: campaign.title,
          text: `Check out "${campaign.title}" on StellarGive`,
          url: url,
        });
        toast.success("Thanks for sharing!");
      } catch (err: unknown) {
        // If user cancelled the share sheet, AbortError is thrown. We ignore it.
        // For other errors, we fallback to our manual dialog.
        const isAbort =
          typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
        if (!isAbort) {
          setOpen(true);
        }
      }
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={handleShareClick}
        aria-label="Share campaign"
        title="Share campaign"
      >
        <Share2 className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Share Campaign</DialogTitle>
            <DialogDescription>
              Help spread the word about &quot;{campaign.title}&quot;
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleTwitterShare}
            >
              <Twitter className="w-4 h-4" />
              Share on X
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleTelegramShare}
            >
              <Send className="w-4 h-4" />
              Share on Telegram
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleWhatsAppShare}
            >
              <MessageCircle className="w-4 h-4" />
              Share on WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
