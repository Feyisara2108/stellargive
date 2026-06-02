import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { ThemeProvider } from "next-themes";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset DOM
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    vi.clearAllMocks();
  });

  it("should have no accessibility violations", async () => {
    const { container } = render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    );
    // Wait for mount
    await screen.findByRole("button", { name: /toggle theme/i });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should toggle theme from light to dark", async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = await screen.findByRole("button", { name: /toggle theme/i });
    
    // Initially should be light
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Click to toggle
    fireEvent.click(button);

    // After click should be dark
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("should persist theme from localStorage", async () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ThemeToggle />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("should respect system preference when set to system", async () => {
    // Mock window.matchMedia for dark mode
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ThemeToggle />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
