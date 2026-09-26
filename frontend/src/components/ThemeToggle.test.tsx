import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle";
import { ThemeProvider } from "next-themes";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

function renderToggle(props: { defaultTheme?: string } = {}) {
  return render(
    <ThemeProvider attribute="class" defaultTheme={props.defaultTheme ?? "system"} enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

async function findOption(name: RegExp) {
  const option = await screen.findByRole("radio", { name });
  await waitFor(() => expect(option).not.toBeDisabled());
  return option;
}

function mockSystemDark(isDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: isDark && query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    vi.clearAllMocks();
    mockSystemDark(false);
  });

  it("should have no accessibility violations", async () => {
    const { container } = renderToggle();
    await findOption(/system theme/i);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders a labelled radiogroup with System, Light and Dark options", async () => {
    renderToggle();
    expect(screen.getByRole("radiogroup", { name: /theme/i })).toBeInTheDocument();
    expect(await findOption(/system theme/i)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /light theme/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /dark theme/i })).toBeInTheDocument();
  });

  it("marks System as selected by default", async () => {
    renderToggle();
    const system = await findOption(/system theme/i);
    expect(system).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /light theme/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("switches to dark and persists the explicit choice", async () => {
    renderToggle({ defaultTheme: "light" });
    fireEvent.click(await findOption(/dark theme/i));

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: /dark theme/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("persists an explicit System choice rather than the resolved theme", async () => {
    mockSystemDark(true);
    renderToggle({ defaultTheme: "light" });
    fireEvent.click(await findOption(/system theme/i));

    await waitFor(() => expect(localStorage.getItem("theme")).toBe("system"));
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("restores the stored choice across sessions", async () => {
    localStorage.setItem("theme", "dark");
    renderToggle({ defaultTheme: "light" });

    const dark = await findOption(/dark theme/i);
    expect(dark).toHaveAttribute("aria-checked", "true");
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("respects the system preference when set to system", async () => {
    mockSystemDark(true);
    renderToggle({ defaultTheme: "system" });

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });

  it("keeps only the selected option in the tab order", async () => {
    renderToggle({ defaultTheme: "light" });
    const light = await findOption(/light theme/i);
    expect(light).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /system theme/i })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: /dark theme/i })).toHaveAttribute("tabindex", "-1");
  });

  it("moves selection and focus with arrow keys, wrapping around", async () => {
    renderToggle({ defaultTheme: "light" });
    const light = await findOption(/light theme/i);
    const dark = screen.getByRole("radio", { name: /dark theme/i });
    const system = screen.getByRole("radio", { name: /system theme/i });

    light.focus();
    fireEvent.keyDown(light, { key: "ArrowRight" });
    await waitFor(() => expect(dark).toHaveAttribute("aria-checked", "true"));
    expect(dark).toHaveFocus();
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.keyDown(dark, { key: "ArrowRight" });
    await waitFor(() => expect(system).toHaveAttribute("aria-checked", "true"));
    expect(system).toHaveFocus();

    fireEvent.keyDown(system, { key: "ArrowLeft" });
    await waitFor(() => expect(dark).toHaveAttribute("aria-checked", "true"));
    expect(dark).toHaveFocus();
  });

  it("supports Home and End keys", async () => {
    renderToggle({ defaultTheme: "light" });
    const light = await findOption(/light theme/i);

    fireEvent.keyDown(light, { key: "End" });
    const dark = screen.getByRole("radio", { name: /dark theme/i });
    await waitFor(() => expect(dark).toHaveAttribute("aria-checked", "true"));

    fireEvent.keyDown(dark, { key: "Home" });
    const system = screen.getByRole("radio", { name: /system theme/i });
    await waitFor(() => expect(system).toHaveAttribute("aria-checked", "true"));
    expect(system).toHaveFocus();
  });

  it("ignores unrelated keys", async () => {
    renderToggle({ defaultTheme: "light" });
    const light = await findOption(/light theme/i);
    fireEvent.keyDown(light, { key: "a" });
    expect(light).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem("theme")).not.toBe("dark");
  });
});
