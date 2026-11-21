import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCampaignTags } from "./useCampaignTags";

describe("useCampaignTags", () => {
  it("normalises tags: ' Clean Water ' is stored as clean-water", () => {
    const { result } = renderHook(() => useCampaignTags());

    act(() => {
      result.current.commitTag(" Clean Water ");
    });

    expect(result.current.tags).toEqual(["clean-water"]);
    expect(result.current.tagInput).toBe("");
    expect(result.current.tagError).toBe("");
  });

  it("ignores empty or whitespace-only values without an error", () => {
    const { result } = renderHook(() => useCampaignTags());

    act(() => {
      result.current.commitTag("");
    });
    expect(result.current.tags).toEqual([]);
    expect(result.current.tagError).toBe("");

    act(() => {
      result.current.commitTag("   \t  \n ");
    });
    expect(result.current.tags).toEqual([]);
    expect(result.current.tagError).toBe("");
  });

  describe("error cases", () => {
    it("sets 'Maximum 10 tags allowed.' when trying to add an 11th tag", () => {
      const { result } = renderHook(() => useCampaignTags());

      for (let i = 1; i <= 10; i++) {
        act(() => {
          result.current.commitTag(`tag-${i}`);
        });
      }
      expect(result.current.tags).toHaveLength(10);
      expect(result.current.tagError).toBe("");

      act(() => {
        result.current.commitTag("tag-11");
      });
      expect(result.current.tags).toHaveLength(10);
      expect(result.current.tagError).toBe("Maximum 10 tags allowed.");
    });

    it("sets length error when a tag exceeds 30 characters", () => {
      const { result } = renderHook(() => useCampaignTags());
      const longTag = "a".repeat(31);

      act(() => {
        result.current.commitTag(longTag);
      });

      expect(result.current.tags).toEqual([]);
      expect(result.current.tagError).toBe("Tag must be 30 characters or fewer.");
    });

    it("sets 'Tag already added.' on duplicate tags", () => {
      const { result } = renderHook(() => useCampaignTags());

      act(() => {
        result.current.commitTag("education");
      });
      expect(result.current.tags).toEqual(["education"]);

      act(() => {
        result.current.commitTag(" Education ");
      });
      expect(result.current.tags).toEqual(["education"]);
      expect(result.current.tagError).toBe("Tag already added.");
    });

    it("clears the error and the input when a valid tag is added afterwards", () => {
      const { result } = renderHook(() => useCampaignTags());

      act(() => {
        result.current.commitTag("duplicate");
      });
      act(() => {
        result.current.commitTag("duplicate");
      });
      expect(result.current.tagError).toBe("Tag already added.");

      act(() => {
        result.current.setTagInput("valid-tag");
        result.current.commitTag("valid-tag");
      });

      expect(result.current.tags).toEqual(["duplicate", "valid-tag"]);
      expect(result.current.tagError).toBe("");
      expect(result.current.tagInput).toBe("");
    });
  });

  describe("removeTag and reset", () => {
    it("removeTag removes the chip and clears any active error", () => {
      const { result } = renderHook(() => useCampaignTags());

      act(() => {
        result.current.commitTag("tag1");
        result.current.commitTag("tag2");
        result.current.setTagError("Some existing error");
      });
      expect(result.current.tags).toEqual(["tag1", "tag2"]);
      expect(result.current.tagError).toBe("Some existing error");

      act(() => {
        result.current.removeTag("tag1");
      });

      expect(result.current.tags).toEqual(["tag2"]);
      expect(result.current.tagError).toBe("");
    });

    it("reset clears tags and input", () => {
      const { result } = renderHook(() => useCampaignTags());

      act(() => {
        result.current.commitTag("tag1");
        result.current.setTagInput("half-typed");
      });
      expect(result.current.tags).toEqual(["tag1"]);
      expect(result.current.tagInput).toBe("half-typed");

      act(() => {
        result.current.reset();
      });

      expect(result.current.tags).toEqual([]);
      expect(result.current.tagInput).toBe("");
    });
  });

  it("exposes state setters (setTags, setTagInput, setTagError)", () => {
    const { result } = renderHook(() => useCampaignTags());

    act(() => {
      result.current.setTags(["custom-1", "custom-2"]);
      result.current.setTagInput("pending");
      result.current.setTagError("manual error");
    });

    expect(result.current.tags).toEqual(["custom-1", "custom-2"]);
    expect(result.current.tagInput).toBe("pending");
    expect(result.current.tagError).toBe("manual error");
  });
});
