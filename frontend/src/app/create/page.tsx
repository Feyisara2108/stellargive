import { CreateCampaignForm } from "@/components/CreateCampaignForm";

export default function CreateCampaign() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Create a New Campaign</h1>
        <p className="text-muted-foreground">
          Start a new relief campaign and invite donors in minutes.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <CreateCampaignForm inline />
      </div>
    </div>
  );
}
