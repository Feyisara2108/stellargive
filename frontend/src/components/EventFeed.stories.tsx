import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EventFeed } from "./EventFeed";

const stroops = (xlm: number): bigint => BigInt(xlm) * 10_000_000n;

const mockEvents = [
  {
    id: "evt-1",
    topic: "received",
    ledger: 52301,
    data: [1n, "GABC", stroops(250), "GDONATE"],
  },
  {
    id: "evt-2",
    topic: "created",
    ledger: 52280,
    data: [2n, "GCREATOR", "relief", stroops(500_000)],
  },
  {
    id: "evt-3",
    topic: "claimed",
    ledger: 52260,
    data: [3n, "GCREATOR", "GBENE", stroops(120_000)],
  },
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
