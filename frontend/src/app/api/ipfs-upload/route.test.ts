import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

function makeFile(
  name = "logo.png",
  type = "image/png",
  content: BlobPart[] = ["content"],
): File {
  return new File(content, name, { type });
}

function makeRequest(formData: FormData): Request {
  return new Request("http://localhost/api/ipfs-upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/ipfs-upload", () => {
  const originalJwt = process.env.PINATA_JWT;

  beforeEach(() => {
    process.env.PINATA_JWT = "test-jwt";
  });

  afterEach(() => {
    process.env.PINATA_JWT = originalJwt;
    vi.unstubAllGlobals();
  });

  it("returns 500 when PINATA_JWT is not configured", async () => {
    delete process.env.PINATA_JWT;
    const formData = new FormData();
    formData.append("file", makeFile());

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/server ipfs config missing/i);
  });

  it("returns 400 when no file is provided", async () => {
    const formData = new FormData();

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/no file provided/i);
  });

  it("returns 400 for a disallowed file type", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("doc.pdf", "application/pdf"));

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/only png\/jpg files are allowed/i);
  });

  it("returns 400 for an oversize file", async () => {
    const file = makeFile();
    Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/file must be 5mb or less/i);
  });

  it("returns 502 when the Pinata request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => "upstream unavailable",
      }),
    );

    const formData = new FormData();
    formData.append("file", makeFile());

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/ipfs upload failed: upstream unavailable/i);
  });

  it("returns 502 when Pinata succeeds without returning a CID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );

    const formData = new FormData();
    formData.append("file", makeFile());

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toMatch(/ipfs upload succeeded without cid/i);
  });

  it("returns 200 with the cid and metadata_uri on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ IpfsHash: "bafyTestCid123" }),
      }),
    );

    const formData = new FormData();
    formData.append("file", makeFile());

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ cid: "bafyTestCid123", metadata_uri: "ipfs://bafyTestCid123" });
  });
});
