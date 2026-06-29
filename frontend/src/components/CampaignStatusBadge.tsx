import { Badge } from "@/components/ui/badge";

interface CampaignStatusBadgeProps {
  status: string;
  deadline?: bigint;
  className?: string;
}

export function CampaignStatusBadge({
  status,
  deadline,
  className = "",
}: CampaignStatusBadgeProps) {
  let displayStatus = status;

  if (status === "Active" && deadline !== undefined) {
    const isExpired = Date.now() / 1000 > Number(deadline);
    if (isExpired) {
      displayStatus = "Expired";
    }
  }

  let customClasses = "";
  switch (displayStatus) {
    case "All":
      customClasses = "bg-primary/10 text-primary hover:bg-primary/20 border-transparent";
      break;
    case "Active":
      customClasses = "bg-green-500/20 text-green-500 hover:bg-green-500/30 border-transparent";
      break;
    case "Funded":
    case "Claimed":
      customClasses = "bg-blue-500/20 text-blue-500 hover:bg-blue-500/30 border-transparent";
      break;
    case "Cancelled":
      customClasses =
        "bg-destructive/20 text-destructive hover:bg-destructive/30 border-transparent";
      break;
    case "Expired":
    default:
      customClasses = "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent";
      break;
  }

  return (
    <Badge
      variant="outline"
      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${customClasses} ${className}`}
    >
      {displayStatus}
    </Badge>
  );
}
