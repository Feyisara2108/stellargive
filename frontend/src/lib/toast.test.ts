import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sonner = vi.hoisted(() => ({
  loading: vi.fn(() => "toast-1"),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: sonner }));

import { notify, txAction } from "./toast";

const EXPLORER = "https://stellar.expert/explorer/testnet/tx/";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notify.loading", () => {
  it("shows a loading toast with the default message and returns its id", () => {
    const id = notify.loading();

    expect(sonner.loading).toHaveBeenCalledWith("Submitting transaction...");
    expect(id).toBe("toast-1");
  });

  it("forwards a custom message", () => {
    notify.loading("Cancelling campaign...");

    expect(sonner.loading).toHaveBeenCalledWith("Cancelling campaign...");
  });
});

describe("notify.success", () => {
  it("shows a success toast without an action when no hash is given", () => {
    notify.success("Saved");

    expect(sonner.success).toHaveBeenCalledWith("Saved", { action: undefined });
  });

  it("attaches a View Explorer action that opens the tx when a hash is given", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    notify.success("Transaction confirmed", { hash: "abc123" });

    const [, options] = sonner.success.mock.calls[0] as unknown as [string, any];
    expect(options.action.label).toBe("View Explorer");
    options.action.onClick();
    expect(open).toHaveBeenCalledWith(`${EXPLORER}abc123`, "_blank");
  });

  it("updates an existing toast in place when an id is given", () => {
    notify.success("Transaction confirmed", { id: "toast-1" });

    expect(sonner.success).toHaveBeenCalledWith("Transaction confirmed", {
      id: "toast-1",
      action: undefined,
    });
  });
});

describe("notify.error", () => {
  it("shows an error toast", () => {
    notify.error("Something went wrong");

    expect(sonner.error).toHaveBeenCalledWith("Something went wrong");
  });

  it("updates an existing toast in place when an id is given", () => {
    notify.error("Simulation failed", { id: "toast-1" });

    expect(sonner.error).toHaveBeenCalledWith("Simulation failed", { id: "toast-1" });
  });
});

describe("duplicate handling", () => {
  it("reuses the loading toast id so the result replaces it instead of stacking", () => {
    const id = notify.loading();
    notify.success("Transaction confirmed", { id, hash: "abc123" });

    expect(sonner.success).toHaveBeenCalledWith(
      "Transaction confirmed",
      expect.objectContaining({ id: "toast-1" }),
    );
  });

  it("does not de-duplicate calls without an id", () => {
    notify.error("Network error");
    notify.error("Network error");

    expect(sonner.error).toHaveBeenCalledTimes(2);
  });
});

describe("txAction", () => {
  it("builds a View Explorer action for the given hash", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    const action = txAction("def456");
    action.onClick();

    expect(action.label).toBe("View Explorer");
    expect(open).toHaveBeenCalledWith(`${EXPLORER}def456`, "_blank");
  });
});
