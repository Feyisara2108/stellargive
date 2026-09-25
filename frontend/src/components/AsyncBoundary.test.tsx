import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AsyncBoundary } from "./AsyncBoundary";

describe("AsyncBoundary", () => {
  describe("loading path", () => {
    it("renders the loading fallback while pending", () => {
      const { container } = render(
        <AsyncBoundary isLoading isError={false}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.queryByText("Resolved content")).not.toBeInTheDocument();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    it("renders a custom loading slot when provided", () => {
      render(
        <AsyncBoundary isLoading isError={false} loadingSlot={<p>Loading campaigns…</p>}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Loading campaigns…")).toBeInTheDocument();
      expect(screen.queryByText("Resolved content")).not.toBeInTheDocument();
    });

    it("prioritizes the loading state over the error state", () => {
      const { container } = render(
        <AsyncBoundary isLoading isError onRetry={vi.fn()}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  });

  describe("skeleton variants", () => {
    it.each(["card", "list", "detail", "stat"] as const)(
      "renders the built-in %s skeleton while loading",
      (variant) => {
        const { container } = render(
          <AsyncBoundary isLoading isError={false} skeleton={variant}>
            <p>Resolved content</p>
          </AsyncBoundary>,
        );

        expect(container.querySelector(`[data-skeleton-variant="${variant}"]`)).not.toBeNull();
        expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
        expect(screen.queryByText("Resolved content")).not.toBeInTheDocument();
      },
    );

    it("announces the loading state to assistive technology", () => {
      render(
        <AsyncBoundary isLoading isError={false} skeleton="list">
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-busy", "true");
      expect(status).toHaveTextContent("Loading…");
    });

    it("repeats items according to skeletonCount", () => {
      const { container } = render(
        <AsyncBoundary isLoading isError={false} skeleton="list" skeletonCount={7}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(container.querySelectorAll('[data-skeleton-variant="list"] > li')).toHaveLength(7);
    });

    it("lets loadingSlot override the skeleton variant", () => {
      const { container } = render(
        <AsyncBoundary
          isLoading
          isError={false}
          skeleton="card"
          loadingSlot={<p>Loading campaigns…</p>}
        >
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Loading campaigns…")).toBeInTheDocument();
      expect(container.querySelector("[data-skeleton-variant]")).toBeNull();
    });

    it("ignores the skeleton variant once content resolves", () => {
      const { container } = render(
        <AsyncBoundary isLoading={false} isError={false} skeleton="card">
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Resolved content")).toBeInTheDocument();
      expect(container.querySelector("[data-skeleton-variant]")).toBeNull();
    });
  });

  describe("layout reservation", () => {
    it("reserves the same minHeight while loading and after resolving", () => {
      const { container, rerender } = render(
        <AsyncBoundary isLoading isError={false} skeleton="stat" minHeight="12rem">
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      const loadingWrapper = container.firstElementChild as HTMLElement;
      expect(loadingWrapper.style.minHeight).toBe("12rem");

      rerender(
        <AsyncBoundary isLoading={false} isError={false} skeleton="stat" minHeight="12rem">
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      const resolvedWrapper = container.firstElementChild as HTMLElement;
      expect(resolvedWrapper.style.minHeight).toBe("12rem");
      expect(resolvedWrapper).toContainElement(screen.getByText("Resolved content"));
    });

    it("does not add a wrapper element when minHeight is omitted", () => {
      const { container } = render(
        <AsyncBoundary isLoading={false} isError={false}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(container.firstElementChild?.tagName).toBe("P");
    });
  });

  describe("error path", () => {
    it("renders the default error fallback when the fetch fails", () => {
      render(
        <AsyncBoundary isLoading={false} isError onRetry={vi.fn()}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(
        screen.getByText(/We encountered an error while fetching this data/i),
      ).toBeInTheDocument();
      expect(screen.queryByText("Resolved content")).not.toBeInTheDocument();
    });

    it("invokes the provided refetch handler when retry is clicked", async () => {
      const onRetry = vi.fn();
      render(
        <AsyncBoundary isLoading={false} isError onRetry={onRetry}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    });

    it("hides the retry button when no refetch handler is provided", () => {
      render(
        <AsyncBoundary isLoading={false} isError>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  describe("success path", () => {
    it("renders children once the query resolves", () => {
      render(
        <AsyncBoundary isLoading={false} isError={false}>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Resolved content")).toBeInTheDocument();
    });

    it("renders the empty state when the result set is empty", () => {
      render(
        <AsyncBoundary isLoading={false} isError={false} isEmpty>
          <p>Resolved content</p>
        </AsyncBoundary>,
      );

      expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
      expect(screen.queryByText("Resolved content")).not.toBeInTheDocument();
    });
  });
});
