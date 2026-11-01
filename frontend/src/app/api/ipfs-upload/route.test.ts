import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { File as NodeFile } from "node:buffer";
import { POST } from "./route";

// The route is server code and runs against Node's File/FormData/Request, which is what Next.js
// provides. jsdom replaces the global File and FormData with its own, and undici can neither
// serialize nor parse those (and `file instanceof File` would never match a parsed upload), so
// restore Node's implementations for this suite.
const NodeFormData = (
  await new Response("a=1", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
  }).formData()
).constructor;

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let requestIp = 1;

function makeFile(
  name = "logo.png",
  type = "image/png",
  content: BlobPart[] = [PNG_SIGNATURE],
): File {
  return new File(content, name, { type });
}

function makeRequest(formData: FormData, headers: HeadersInit = {}): Request {
  requestIp += 1;
  return new Request("http://localhost/api/ipfs-upload", {
    method: "POST",
    body: formData,
    headers: {
      origin: "http://localhost",
      "x-forwarded-for": `192.0.2.${requestIp}`,
      ...headers,
    },
  });
}

describe("POST /api/ipfs-upload", () => {
  const originalJwt = process.env.PINATA_JWT;

  beforeEach(() => {
    vi.stubGlobal("File", NodeFile);
    vi.stubGlobal("FormData", NodeFormData);
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
    formData.append("file", makeFile("doc.pdf", "application/pdf", ["not an image"]));

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/only png\/jpg files are allowed/i);
  });

  it("rejects a renamed non-image based on its magic bytes", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("photo.png", "image/png", ["not an image"]));

    const response = await POST(makeRequest(formData));

    expect(response.status).toBe(400);
  });

  it("rejects an oversized request before parsing its body", async () => {
    const formData = new FormData();
    formData.append("file", makeFile());
    const request = makeRequest(formData, { "content-length": String(5 * 1024 * 1024 + 1) });
    const formDataSpy = vi.spyOn(request, "formData");

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formDataSpy).not.toHaveBeenCalled();
  });

  it("returns 400 for an oversize file", async () => {
    const oversize = new Uint8Array(5 * 1024 * 1024 + 1);
    oversize.set(PNG_SIGNATURE);
    const file = makeFile("big.png", "image/png", [oversize]);
    const formData = new FormData();
    formData.append("file", file);

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/file must be 5mb or less/i);
  });

  it("returns a generic error and logs details when the Pinata request fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "upstream unavailable",
      }),
    );

    const formData = new FormData();
    formData.append("file", makeFile());

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("IPFS upload failed. Please try again.");
    expect(JSON.stringify(errorSpy.mock.calls)).toContain("upstream unavailable");
    errorSpy.mockRestore();
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ IpfsHash: "bafyTestCid123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.append("file", makeFile("../campaign\r\nlogo.png"));

    const response = await POST(makeRequest(formData));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ cid: "bafyTestCid123", metadata_uri: "ipfs://bafyTestCid123" });
    const pinataForm = fetchMock.mock.calls[0][1].body as FormData;
    expect(JSON.parse(pinataForm.get("pinataMetadata") as string)).toEqual({
      name: "campaign__logo.png",
    });
  });

  it("throttles repeated uploads from the same IP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ IpfsHash: "bafyTestCid123" }),
      }),
    );

    const responses = [];
    for (let i = 0; i < 11; i += 1) {
      const formData = new FormData();
      formData.append("file", makeFile());
      responses.push(await POST(makeRequest(formData, { "x-forwarded-for": "198.51.100.10" })));
    }

    expect(responses.slice(0, 10).every((response) => response.status === 200)).toBe(true);
    expect(responses[10].status).toBe(429);
  });
});
