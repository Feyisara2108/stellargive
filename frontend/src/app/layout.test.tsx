import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RootLayout from "./layout";

// next/font/google requires network access to fetch font metadata at build
// time and isn't set up to run under vitest; every consumer just needs a
// stable className string back.
vi.mock("next/font/google", () => ({
  Inter: () => ({ className: "inter-mock" }),
}));

// RootLayout pulls in the full provider tree (wallet, query client, theme,
// command palette, toaster) which isn't relevant to the skip-link ->
// main-content wiring under test here (#697). Replace it with a pass-through
// so this test exercises the real skip-link and <main> markup from
// layout.tsx without needing wallet/network mocks.
vi.mock("@/components/Providers", () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/Footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock("@/components/ConsentBanner", () => ({
  ConsentBanner: () => null,
}));

describe("RootLayout skip link (#697)", () => {
  it("has exactly one main-content id, on the <main> element wrapping page content", () => {
    render(
      <RootLayout>
        <h1>Page heading</h1>
      </RootLayout>,
    );

    const matches = document.querySelectorAll("#main-content");
    expect(matches).toHaveLength(1);

    const main = matches[0];
    expect(main.tagName).toBe("MAIN");
    expect(main).toHaveTextContent("Page heading");
  });

  it("is visually hidden until focused", () => {
    render(
      <RootLayout>
        <h1>Page heading</h1>
      </RootLayout>,
    );

    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    expect(skipLink).toHaveClass("sr-only");
    expect(skipLink).toHaveClass("focus:not-sr-only");
  });

  it("moves focus to the main content container when activated via Tab + Enter", async () => {
    const user = userEvent.setup();
    render(
      <RootLayout>
        <h1>Page heading</h1>
      </RootLayout>,
    );

    const skipLink = screen.getByRole("link", { name: "Skip to content" });
    const main = document.getElementById("main-content");
    expect(main).not.toBeNull();

    // Nothing is focused yet; Tab should reach the skip link first since it
    // is the first focusable element in the document.
    await user.tab();
    expect(skipLink).toHaveFocus();

    // jsdom does not implement native browser navigation for in-page anchor
    // links (it won't move focus to the target on its own), so this
    // confirms the href target actually resolves to the container we expect
    // main to be, and that main itself is focusable (tabIndex={-1}) so a
    // real browser's built-in anchor-activation focus behavior lands there.
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(main).toHaveAttribute("tabindex", "-1");

    main?.focus();
    expect(main).toHaveFocus();
  });
});
