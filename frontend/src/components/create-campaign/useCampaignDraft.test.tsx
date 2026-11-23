import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { logger } from "@/lib/logger";
import { clearCampaignDraft, DRAFT_STORAGE_KEY, useCampaignDraft } from "./useCampaignDraft";
import { DEFAULT_VALUES, formSchema, type FormValues } from "./schema";

function useTestHarness(initialTags: string[] = []) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onChange",
  });
  const [tags, setTags] = useState<string[]>(initialTags);
  const formValues = useCampaignDraft(form, tags, setTags);
  return { form, tags, setTags, formValues };
}

describe("useCampaignDraft", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("clearCampaignDraft removes the key from sessionStorage", () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ title: "Draft" }));
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    clearCampaignDraft();

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("restores draft form values and tags on mount", () => {
    const draftData = {
      title: "Saved Campaign Title",
      description: "A well-written campaign description for testing.",
      tags: ["health", "emergency"],
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));

    const { result } = renderHook(() => useTestHarness());

    expect(result.current.form.getValues("title")).toBe("Saved Campaign Title");
    expect(result.current.form.getValues("description")).toBe(
      "A well-written campaign description for testing.",
    );
    expect(result.current.tags).toEqual(["health", "emergency"]);
    expect(result.current.form.formState.isDirty).toBe(true);
  });

  it("ignores non-array tags and undefined values during draft restoration", () => {
    const draftData = {
      title: "Valid Title",
      tags: "not-an-array",
      website: undefined,
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));

    const { result } = renderHook(() => useTestHarness());

    expect(result.current.form.getValues("title")).toBe("Valid Title");
    expect(result.current.tags).toEqual([]);
  });

  it("logs corrupt JSON through logger.error, does not throw, and still runs form.trigger", () => {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, "{corrupt-json-string");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    let hookResult:
      | ReturnType<typeof renderHook<ReturnType<typeof useTestHarness>, unknown>>["result"]
      | undefined;
    expect(() => {
      const { result } = renderHook(() => useTestHarness());
      hookResult = result;
    }).not.toThrow();

    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to restore campaign draft",
      expect.any(SyntaxError),
    );
    expect(hookResult?.current.form.getValues("title")).toBe("");
  });

  it("persists edited fields and tags after the 500ms debounce while omitting beneficiary information", () => {
    const { result } = renderHook(() => useTestHarness());

    act(() => {
      result.current.form.setValue("title", "New Clean Water Campaign", {
        shouldDirty: true,
      });
      result.current.form.setValue(
        "beneficiary",
        "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
        { shouldDirty: true },
      );
      result.current.form.setValue("beneficiaryShare", "70", {
        shouldDirty: true,
      });
      result.current.form.setValue(
        "extraBeneficiaries",
        [
          {
            address: "GC3C4AKRBQL7XEZBXAOE2X4QOQ6Z3P4V3Z2NOHK2SZZ4G7N7Y6Q7R8S9",
            share: "30",
          },
        ],
        { shouldDirty: true },
      );
    });

    // Before advancing debounce, the newly edited title has not yet propagated to storage
    const beforeDebounce = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (beforeDebounce) {
      expect(JSON.parse(beforeDebounce).title).toBe("");
    }

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const storedRaw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!);

    expect(stored.title).toBe("New Clean Water Campaign");
    expect(stored.tags).toEqual([]);
    expect(stored.beneficiary).toBeUndefined();
    expect(stored.beneficiaryShare).toBeUndefined();
    expect(stored.extraBeneficiaries).toBeUndefined();

    // Now update tags as well
    act(() => {
      result.current.setTags(["clean-water", "community"]);
    });

    const updatedRaw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(updatedRaw).not.toBeNull();
    const updated = JSON.parse(updatedRaw!);
    expect(updated.title).toBe("New Clean Water Campaign");
    expect(updated.tags).toEqual(["clean-water", "community"]);
  });

  it("removes stored draft when the form is pristine and has no tags", () => {
    const { result } = renderHook(() => useTestHarness([]));

    // Simulate draft in storage while form is pristine with no tags
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ title: "Stale Draft" }));

    expect(result.current.form.formState.isDirty).toBe(false);
    expect(result.current.tags).toEqual([]);

    act(() => {
      // Trigger effect by re-evaluating or advancing debounce
      vi.advanceTimersByTime(500);
    });

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("removes stored draft when a dirty form is reset back to pristine with no tags", () => {
    const { result } = renderHook(() => useTestHarness([]));

    act(() => {
      result.current.form.setValue("title", "Temporary Edit", { shouldDirty: true });
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).not.toBeNull();

    act(() => {
      result.current.form.reset(DEFAULT_VALUES);
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("persists draft when form is pristine but tags are present", () => {
    const { result } = renderHook(() => useTestHarness(["solar"]));

    expect(result.current.form.formState.isDirty).toBe(false);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const storedRaw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!);
    expect(stored.tags).toEqual(["solar"]);
  });
});
