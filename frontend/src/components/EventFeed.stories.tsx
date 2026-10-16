import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventFeed } from "./EventFeed";
import { makeClaimedEvent, makeCreatedEvent, makeDonationEvent } from "@/test/factories";

const stroops = (xlm: number): bigint => BigInt(xlm) * 10_000_000n;

const mockEvents = [
  makeDonationEvent("evt-1", "GABC", stroops(250), 1n, 52301),
  makeCreatedEvent("evt-2", { id: 2n, creator: "GCREATOR", target_amount: stroops(500_000) }, 52280),
  makeClaimedEvent(
    "evt-3",
    { campaign_id: 3n, beneficiary: "GBENE", amount: stroops(120_000) },
    52260,
  ),
];

function makeClient(data?: typeof mockEvents) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (data !== undefined) {
    client.setQueryData(["events", 20], data);
  }
  return client;
}

const withQueryClient = (client: QueryClient) =>
  function QueryDecorator(Story: React.ComponentType) {
    return (
      <QueryClientProvider client={client}>
        <div className="w-[400px]">
          <Story />
        </div>
      </QueryClientProvider>
    );
  };

const meta: Meta<typeof EventFeed> = {
  title: "Components/EventFeed",
  component: EventFeed,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof EventFeed>;

export const WithEvents: Story = {
  decorators: [withQueryClient(makeClient(mockEvents))],
};

export const Empty: Story = {
  decorators: [withQueryClient(makeClient([]))],
};

export const Loading: Story = {
  decorators: [withQueryClient(makeClient())],
};
