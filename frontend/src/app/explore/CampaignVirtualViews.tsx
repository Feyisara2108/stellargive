"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { List, type RowComponentProps } from "react-window";
import { CampaignCard } from "@/components/CampaignCard";
import type { Campaign, TokenMetadata } from "@/lib/soroban";

// ---------------------------------------------------------------------------
// Virtualisation constants
// ---------------------------------------------------------------------------
/** Estimated card height (grid mode). Generous to avoid clipping. */
const GRID_CARD_HEIGHT = 340;
/** Estimated row height (list mode). */
const LIST_CARD_HEIGHT = 160;
/** gap-6 = 1.5rem = 24px */
const GRID_GAP = 24;

export interface CampaignItem {
  campaign: Campaign;
  tokenMeta?: TokenMetadata;
  detailHrefSearch: string;
}

// ---------------------------------------------------------------------------
// Responsive column count — mirrors Tailwind md/lg breakpoints.
// ---------------------------------------------------------------------------
function useColumnCount(): number {
  const getCount = useCallback(() => {
    if (typeof window === "undefined") return 1;
    if (window.matchMedia("(min-width: 1024px)").matches) return 3;
    if (window.matchMedia("(min-width: 768px)").matches) return 2;
    return 1;
  }, []);

  const [columns, setColumns] = useState(getCount);

  useEffect(() => {
    const mdMq = window.matchMedia("(min-width: 768px)");
    const lgMq = window.matchMedia("(min-width: 1024px)");
    const update = () => setColumns(getCount());
    mdMq.addEventListener("change", update);
    lgMq.addEventListener("change", update);
    return () => {
      mdMq.removeEventListener("change", update);
      lgMq.removeEventListener("change", update);
    };
  }, [getCount]);

  return columns;
}

// ---------------------------------------------------------------------------
// ResizeObserver-based width measurement — avoids adding AutoSizer as a dep.
// ---------------------------------------------------------------------------
function useContainerWidth(ref: React.RefObject<HTMLDivElement>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return width;
}

// ---------------------------------------------------------------------------
// Grid row renderer — up to `columnCount` cards per row.
// ---------------------------------------------------------------------------
interface GridRowProps {
  rows: CampaignItem[][];
  columnCount: number;
  listWidth: number;
  isRefreshing: boolean;
}

function GridRow({
  index,
  style,
  rows,
  columnCount,
  listWidth,
  isRefreshing,
}: RowComponentProps<GridRowProps>) {
  const row = rows[index];
  if (!row) return null;

  const cellWidth = listWidth > 0 ? (listWidth - GRID_GAP * (columnCount - 1)) / columnCount : 0;

  return (
    <div role="row" style={{ ...style, display: "flex", gap: GRID_GAP, paddingBottom: GRID_GAP }}>
      {row.map(({ campaign, tokenMeta, detailHrefSearch }) => (
        <div
          key={campaign.id.toString()}
          role="gridcell"
          style={{
            width: cellWidth,
            flexShrink: 0,
            opacity: isRefreshing ? 0.5 : 1,
            transition: "opacity 200ms",
          }}
        >
          <CampaignCard
            campaign={campaign}
            preloadedTokenMeta={tokenMeta}
            detailHrefSearch={detailHrefSearch}
          />
        </div>
      ))}
      {Array.from({ length: columnCount - row.length }).map((_, i) => (
        <div
          key={`phantom-${i}`}
          role="presentation"
          aria-hidden="true"
          style={{ width: cellWidth, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List row renderer — single card per row.
// ---------------------------------------------------------------------------
interface ListRowProps {
  campaigns: CampaignItem[];
  isRefreshing: boolean;
}

function ListRow({ index, style, campaigns, isRefreshing }: RowComponentProps<ListRowProps>) {
  const item = campaigns[index];
  if (!item) return null;
  return (
    <div
      role="row"
      style={{
        ...style,
        paddingBottom: GRID_GAP,
        opacity: isRefreshing ? 0.5 : 1,
        transition: "opacity 200ms",
      }}
    >
      <div role="gridcell">
        <CampaignCard
          campaign={item.campaign}
          preloadedTokenMeta={item.tokenMeta}
          detailHrefSearch={item.detailHrefSearch}
        />
      </div>
    </div>
  );
}

interface CampaignViewProps {
  items: CampaignItem[];
  isRefreshing: boolean;
}

// ---------------------------------------------------------------------------
// Virtualised grid view
// role="grid" + role="row" + role="gridcell" preserve the WAI-ARIA grid
// pattern for screen-reader and keyboard nav. The container measures its own
// width, then hands it to the virtual List.
// ---------------------------------------------------------------------------
export function CampaignGridView({ items, isRefreshing }: CampaignViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const columnCount = useColumnCount();
  const listWidth = useContainerWidth(containerRef);

  const rows: CampaignItem[][] = [];
  for (let i = 0; i < items.length; i += columnCount) {
    rows.push(items.slice(i, i + columnCount));
  }
  const rowHeight = GRID_CARD_HEIGHT + GRID_GAP;
  const totalHeight = rows.length * rowHeight;

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label="Campaign grid"
      aria-rowcount={rows.length}
      aria-colcount={columnCount}
      style={listWidth > 0 ? { height: totalHeight } : undefined}
    >
      {/* JSDOM / SSR fallback — flat grid until the ResizeObserver fires. */}
      {listWidth === 0 ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          style={{ opacity: isRefreshing ? 0.5 : 1, transition: "opacity 200ms" }}
        >
          {items.map(({ campaign, tokenMeta, detailHrefSearch }) => (
            <div key={campaign.id.toString()} role="gridcell">
              <CampaignCard
                campaign={campaign}
                preloadedTokenMeta={tokenMeta}
                detailHrefSearch={detailHrefSearch}
              />
            </div>
          ))}
        </div>
      ) : (
        <List
          rowCount={rows.length}
          rowHeight={rowHeight}
          rowComponent={GridRow}
          rowProps={{ rows, columnCount, listWidth, isRefreshing }}
          overscanCount={2}
          style={{ height: totalHeight, width: listWidth, outline: "none", overflow: "visible" }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Virtualised list view
// ---------------------------------------------------------------------------
export function CampaignListView({ items, isRefreshing }: CampaignViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const listWidth = useContainerWidth(containerRef);
  const rowHeight = LIST_CARD_HEIGHT + GRID_GAP;
  const totalHeight = items.length * rowHeight;

  return (
    <div
      ref={containerRef}
      role="grid"
      aria-label="Campaign list"
      aria-rowcount={items.length}
      aria-colcount={1}
      style={listWidth > 0 ? { height: totalHeight } : undefined}
    >
      {/* JSDOM / SSR fallback — flat list until the ResizeObserver fires. */}
      {listWidth === 0 ? (
        <div
          className="flex flex-col gap-4"
          style={{ opacity: isRefreshing ? 0.5 : 1, transition: "opacity 200ms" }}
        >
          {items.map(({ campaign, tokenMeta, detailHrefSearch }) => (
            <div key={campaign.id.toString()} role="gridcell">
              <CampaignCard
                campaign={campaign}
                preloadedTokenMeta={tokenMeta}
                detailHrefSearch={detailHrefSearch}
              />
            </div>
          ))}
        </div>
      ) : (
        <List
          rowCount={items.length}
          rowHeight={rowHeight}
          rowComponent={ListRow}
          rowProps={{ campaigns: items, isRefreshing }}
          overscanCount={3}
          style={{ height: totalHeight, width: listWidth, outline: "none", overflow: "visible" }}
        />
      )}
    </div>
  );
}
