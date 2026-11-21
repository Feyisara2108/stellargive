import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import React from "react";
import { makeCampaign } from "@/test/factories";
import { CampaignGridView, CampaignListView, type CampaignItem } from "./CampaignVirtualViews";

vi.mock("@/components/CampaignCard", () => ({
  CampaignCard: ({ campaign }: { campaign: { title: string } }) => <div>{campaign.title}</div>,
}));

type Listener = () => void;

function stubMatchMedia(width: number) {
  const listeners = new Map<string, Set<Listener>>();
  const removed: string[] = [];
  const state = { width };
  const matchMedia = vi.fn((query: string) => {
    const min = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
    if (!listeners.has(query)) listeners.set(query, new Set());
    const set = listeners.get(query)!;
    return {
      get matches() {
        return state.width >= min;
      },
      media: query,
      addEventListener: (_: string, cb: Listener) => set.add(cb),
      removeEventListener: (_: string, cb: Listener) => {
        set.delete(cb);
        removed.push(query);
      },
    };
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    resize(next: number) {
      state.width = next;
      act(() => listeners.forEach((set) => set.forEach((cb) => cb())));
    },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    removed,
  };
}

const observers: { cb: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];

class StubResizeObserver {
  disconnect = vi.fn();
  constructor(cb: ResizeObserverCallback) {
    observers.push({ cb, disconnect: this.disconnect });
  }
  observe() {}
  unobserve() {}
}

function fireResize(width: number) {
  act(() => {
    observers[0].cb(
      [{ contentRect: { width } } as ResizeObserverEntry],
      {} as unknown as ResizeObserver,
    );
  });
}

function stubWidth(width: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width } as DOMRect);
}

function items(n: number): CampaignItem[] {
  return Array.from({ length: n }, (_, i) => ({
    campaign: makeCampaign({ id: BigInt(i + 1), title: `Campaign ${i + 1}` }),
    detailHrefSearch: "",
  }));
}

describe("CampaignVirtualViews", () => {
  beforeEach(() => {
    observers.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    [500, 1],
    [800, 2],
    [1200, 3],
  ])("uses %ipx breakpoints for %i column(s)", (width, columns) => {
    stubMatchMedia(width);
    render(<CampaignGridView items={items(3)} isRefreshing={false} />);
    expect(screen.getByRole("grid", { name: "Campaign grid" })).toHaveAttribute(
      "aria-colcount",
      String(columns),
    );
  });

  it("updates the column count on media changes and removes listeners on unmount", () => {
    const mq = stubMatchMedia(500);
    const { unmount } = render(<CampaignGridView items={items(3)} isRefreshing={false} />);
    const grid = screen.getByRole("grid", { name: "Campaign grid" });
    expect(grid).toHaveAttribute("aria-colcount", "1");

    mq.resize(1200);
    expect(grid).toHaveAttribute("aria-colcount", "3");

    expect(mq.listenerCount()).toBe(2);
    unmount();
    expect(mq.listenerCount()).toBe(0);
    expect(mq.removed).toEqual(
      expect.arrayContaining(["(min-width: 768px)", "(min-width: 1024px)"]),
    );
  });

  it("switches from the flat fallback to virtual rows with phantom cells", () => {
    stubMatchMedia(1200);
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    stubWidth(0);
    const { unmount } = render(<CampaignGridView items={items(2)} isRefreshing={false} />);
    expect(screen.queryAllByRole("row")).toHaveLength(0);
    expect(screen.getAllByRole("gridcell")).toHaveLength(2);

    fireResize(900);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getAllByRole("gridcell")).toHaveLength(2);
    expect(rows[0].querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);

    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("uses the measured width when ResizeObserver is undefined", () => {
    stubMatchMedia(1200);
    vi.stubGlobal("ResizeObserver", undefined);
    stubWidth(900);
    expect(() => render(<CampaignGridView items={items(3)} isRefreshing={false} />)).not.toThrow();
    expect(screen.getAllByRole("row")).toHaveLength(1);
  });

  it("renders one gridcell per campaign in the list view and dims while refreshing", () => {
    stubMatchMedia(1200);
    vi.stubGlobal("ResizeObserver", undefined);
    stubWidth(900);
    render(<CampaignListView items={items(3)} isRefreshing />);
    const list = screen.getByRole("grid", { name: "Campaign list" });
    expect(list).toHaveAttribute("aria-rowcount", "3");
    expect(screen.getAllByRole("gridcell")).toHaveLength(3);
    screen.getAllByRole("row").forEach((row) => expect(row).toHaveStyle({ opacity: "0.5" }));
  });
});
