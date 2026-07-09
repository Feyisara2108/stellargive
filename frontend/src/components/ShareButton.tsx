"use client";

import { useState } from "react";
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

// We only need the ID and title from the campaign for sharing.
// Doing a loose type helps us use it anywhere without full Campaign type requirement.
interface ShareableCampaign {
  id: bigint;
  title: string;
}

export function ShareButton({ campaign }: { campaign: ShareableCampaign }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
      toast.error("Unable to copy link");
    }
  };

  const handleTwitterShare = () => {
    const url = getShareUrl();
    if (!url) return;

    const text = `Check out "${campaign.title}" on StellarGive`;
    const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, "_blank", "noopener,noreferrer");
  };

  const handleTelegramShare = () => {
    const url = getShareUrl();
    if (!url) return;

    const text = `Check out "${campaign.title}" on StellarGive`;
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    window.open(telegramUrl, "_blank", "noopener,noreferrer");
  };

  const handleWhatsAppShare = () => {
    const url = getShareUrl();
    if (!url) return;

    const text = `Check out "${campaign.title}" on StellarGive: ${url}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

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
      } catch (err: any) {
        // If user cancelled the share sheet, AbortError is thrown. We ignore it.
        // For other errors, we fallback to our manual dialog.
        if (err.name !== "AbortError") {
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
              aria-label="Copy campaign link"
            >
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleTwitterShare}
              aria-label="Share on X"
            >
              <Twitter className="w-4 h-4" />
              Share on X
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleTelegramShare}
              aria-label="Share on Telegram"
            >
              <Send className="w-4 h-4" />
              Share on Telegram
            </Button>

            <Button
              variant="outline"
              className="flex items-center justify-start gap-2 w-full"
              onClick={handleWhatsAppShare}
              aria-label="Share on WhatsApp"
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
