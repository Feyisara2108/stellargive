import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { calculateProgress } from "@/lib/utils";

interface CampaignStatusBadgeProps {
  status: string;
  deadline?: bigint;
  className?: string;
  raisedAmount?: bigint;
  targetAmount?: bigint;
  progress?: number;
}

export function CampaignStatusBadge({
  status,
  deadline,
  className = "",
  raisedAmount,
  targetAmount,
  progress,
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

  let effectiveProgress = progress;
  if (
    effectiveProgress === undefined &&
    raisedAmount !== undefined &&
    targetAmount !== undefined
  ) {
    effectiveProgress = calculateProgress(raisedAmount, targetAmount);
  } else if (effectiveProgress === undefined && (status === "Funded" || status === "Claimed")) {
    effectiveProgress = 100;
  }

  const milestones = [
    {
      threshold: 25,
      label: "25%",
      tooltipText: "25% milestone reached",
      className:
        "bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 border-transparent",
    },
    {
      threshold: 50,
      label: "50%",
      tooltipText: "50% milestone reached",
      className:
        "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/30 border-transparent",
    },
    {
      threshold: 75,
      label: "75%",
      tooltipText: "75% milestone reached",
      className:
        "bg-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/30 border-transparent",
    },
    {
      threshold: 100,
      label: "🎉 Goal Reached",
      tooltipText: "100% funded — Goal Reached!",
      className:
        "bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 text-white font-extrabold border-transparent shadow-sm hover:brightness-110 animate-pulse",
    },
  ];

  const achievedMilestones =
    effectiveProgress !== undefined
      ? milestones.filter((m) => effectiveProgress! >= m.threshold)
      : [];

  if (achievedMilestones.length === 0) {
    return (
      <Badge
        variant="outline"
        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${customClasses} ${className}`}
      >
        {displayStatus}
      </Badge>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <Badge
        variant="outline"
        className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${customClasses}`}
      >
        {displayStatus}
      </Badge>
      {achievedMilestones.map((m) => (
        <Tooltip key={m.threshold}>
          <TooltipTrigger className="relative">
            <Badge
              variant="outline"
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${m.className}`}
            >
              {m.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top">{m.tooltipText}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

