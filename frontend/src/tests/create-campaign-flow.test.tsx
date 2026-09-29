import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { scValToNative } from "@stellar/stellar-sdk";
import { server } from "@/mocks/setup";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { MockWalletProvider } from "@/components/MockWalletProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WALLET_ADDRESS } from "@/test/factories";

/**
 * Integration test covering full campaign creation journey with IPFS upload:
 * 1. Form validation and field gating across intermediate steps
 * 2. File selection and image validation (file type and size limits)
 * 3. Mocked IPFS upload route (/api/ipfs-upload) returning CID and metadata URI
 * 4. Submission calling useCreateCampaign / submitTransaction with unpacked on-chain arguments
 * 5. Navigation to detail page and draft storage cleanup
 */

const pushMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: pushMock }),
  useSearchParams: vi.fn().mockReturnValue({ get: vi.fn() }),
}));

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastLoading = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, loading: toastLoading },
}));

const submitTransactionMock = vi.hoisted(() => vi.fn());
const TOKEN_CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const VALID_BENEFICIARY = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

vi.mock("@/lib/soroban", () => ({
  CONTRACT_ID: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  submitTransaction: submitTransactionMock,
  estimateFee: vi.fn().mockResolvedValue(null),
  getSACBalance: vi.fn().mockResolvedValue(1_000_0000000n),
  getTokenMetadata: vi.fn().mockResolvedValue({ decimals: 7, symbol: "XLM" }),
  MAX_SIMULATION_FEE_STROOPS: 10_000_000,
  toStroops: (amount: string | number): bigint => {
    const parts = amount.toString().split(".");
    let stroops = BigInt(parts[0]) * 10_000_000n;
    if (parts.length > 1) {
      let decimals = parts[1];
      if (decimals.length > 7) decimals = decimals.substring(0, 7);
      else decimals = decimals.padEnd(7, "0");
      stroops += BigInt(decimals);
    }
    return stroops;
  },
}));

vi.mock("@/components/TokenSelector", () => ({
  TokenSelector: ({ value, onChange }: any) => (
    <div data-testid="token-selector">
      <button type="button" onClick={() => onChange(TOKEN_CONTRACT)}>
        Select Token
      </button>
      <span>Selected: {value}</span>
    </div>
  ),
  PREDEFINED_TOKENS: [{ address: TOKEN_CONTRACT, symbol: "XLM" }],
}));

const MOCK_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const MOCK_METADATA_URI = `ipfs://${MOCK_CID}`;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderCreateCampaignFlow() {
  const queryClient = makeQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MockWalletProvider>
        <TooltipProvider delayDuration={0}>
          <CreateCampaignForm inline />
        </TooltipProvider>
      </MockWalletProvider>
    </QueryClientProvider>,
  );
}

describe("Integration: campaign creation flow with IPFS upload mock", () => {
  let originalXhr: typeof XMLHttpRequest;

  beforeEach(() => {
    sessionStorage.clear();
    submitTransactionMock.mockReset();
    pushMock.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
    toastLoading.mockClear();

    (window as any).__mockWalletAddress = WALLET_ADDRESS;

    // Default successful transaction submission
    submitTransactionMock.mockResolvedValue({
      hash: "mock-create-tx-hash",
      campaignId: "42",
      status: "SUCCESS",
    });

    // Mock IPFS upload endpoint in MSW
    server.use(
      http.post("*/api/ipfs-upload", async () => {
        return HttpResponse.json({
          cid: MOCK_CID,
          metadata_uri: MOCK_METADATA_URI,
        });
      }),
    );

    // Bridge XMLHttpRequest to MSW's fetch in jsdom test environment
    originalXhr = window.XMLHttpRequest;
    class InterceptedXMLHttpRequest {
      status = 0;
      responseText = "";
      upload = { onprogress: null as any };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      method = "POST";
      url = "/api/ipfs-upload";

      open = vi.fn((method: string, url: string) => {
        this.method = method;
        this.url = url;
      });

      send = vi.fn(async (body: any) => {
        try {
          if (this.upload.onprogress) {
            this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
          }
          const res = await fetch(this.url, { method: this.method, body });
          this.status = res.status;
          this.responseText = await res.text();
          if (this.upload.onprogress) {
            this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
          }
          this.onload?.();
        } catch {
          this.onerror?.();
        }
      });
    }

    window.XMLHttpRequest = InterceptedXMLHttpRequest as any;
  });

  afterEach(() => {
    window.XMLHttpRequest = originalXhr;
    delete (window as any).__mockWalletAddress;
    sessionStorage.clear();
  });

  it("validates gating across input steps, uploads image to IPFS, and submits create_campaign mutation with exact on-chain arguments", async () => {
    renderCreateCampaignFlow();

    // 1. Initial validation gating: Empty form keeps submit button disabled
    const submitBtn = screen.getByRole("button", { name: /Launch Campaign/i });
    expect(submitBtn).toBeDisabled();

    // 2. Validate title constraint gating (< 5 characters)
    const titleInput = screen.getByPlaceholderText(/Flood Relief 2024/i);
    fireEvent.change(titleInput, { target: { value: "Help" } });
    fireEvent.blur(titleInput);
    expect(await screen.findByText(/Title must be at least 5 characters/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Enter valid title
    fireEvent.change(titleInput, { target: { value: "Disaster Relief Fund 2026" } });
    expect(screen.getByText("25/50")).toBeInTheDocument();

    // 3. Validate description constraint gating (< 10 characters)
    const descInput = screen.getByPlaceholderText(/Provide a detailed description/i);
    fireEvent.change(descInput, { target: { value: "Too brief" } });
    fireEvent.blur(descInput);
    expect(
      await screen.findByText(/Description must be at least 10 characters/i),
    ).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Enter valid description
    const validDesc =
      "Providing immediate emergency shelter, food supplies, and potable water for displaced families.";
    fireEvent.change(descInput, { target: { value: validDesc } });
    expect(screen.getByText(`${validDesc.length} / 500 characters`)).toBeInTheDocument();

    // 4. Validate beneficiary address gating
    const beneficiaryInput = screen.getByPlaceholderText("G...");
    fireEvent.change(beneficiaryInput, { target: { value: "invalid-stellar-key" } });
    fireEvent.blur(beneficiaryInput);
    expect(await screen.findByText(/Invalid Stellar address/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Enter valid beneficiary address
    fireEvent.change(beneficiaryInput, { target: { value: VALID_BENEFICIARY } });

    // 5. Select category
    const categorySelect = screen.getByRole("combobox");
    fireEvent.change(categorySelect, { target: { value: "relief" } });

    // 6. Validate target amount gating (< 1.0 minimum)
    const targetInput = screen.getByPlaceholderText("1000");
    fireEvent.change(targetInput, { target: { value: "0.5" } });
    fireEvent.blur(targetInput);
    expect(await screen.findByText(/Target must be at least 1\.0/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Enter valid target amount
    fireEvent.change(targetInput, { target: { value: "250" } });

    // 7. Validate duration gating
    const durationInput = screen.getByLabelText(/Duration \(Days\)/i);
    fireEvent.change(durationInput, { target: { value: "45" } });

    // 8. Test file selection and IPFS image upload:
    // (a) Reject non-image file selection
    const fileInput = screen.getByLabelText(/Campaign Cover Image/i);
    const pdfFile = new File(["dummy pdf content"], "document.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });
    expect(await screen.findByText(/Only PNG or JPG images are allowed\./i)).toBeInTheDocument();

    // (b) Reject oversized image file selection (> 5MB)
    const oversizedFile = new File(["x".repeat(100)], "huge.png", { type: "image/png" });
    Object.defineProperty(oversizedFile, "size", { value: 6 * 1024 * 1024 });
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });
    expect(await screen.findByText(/Image must be 5MB or less\./i)).toBeInTheDocument();

    // (c) Upload valid PNG image
    const validImageFile = new File(["valid-png-image-binary"], "relief-banner.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [validImageFile] } });

    // Verify upload metadata display
    expect(await screen.findByText(/Selected: relief-banner\.png/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(`CID: ${MOCK_METADATA_URI}`)).toBeInTheDocument();
    });

    // 9. All required steps and validations are satisfied -> Submit button enables
    await waitFor(() => {
      expect(submitBtn).toBeEnabled();
    });

    // 10. Submit campaign
    fireEvent.click(submitBtn);

    // 11. Assert create_campaign mutation is called with expected on-chain arguments
    await waitFor(() => {
      expect(submitTransactionMock).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        "create_campaign",
        expect.any(Array),
      );
    });

    const [callerAddress, methodName, contractArgs] = submitTransactionMock.mock.calls[0];
    expect(callerAddress).toBe(WALLET_ADDRESS);
    expect(methodName).toBe("create_campaign");

    // Assert individual on-chain arguments
    // 1. Creator address
    expect(scValToNative(contractArgs[0])).toBe(WALLET_ADDRESS);
    // 3. Title string
    expect(scValToNative(contractArgs[2])).toBe("Disaster Relief Fund 2026");
    // 4. Description string
    expect(scValToNative(contractArgs[3])).toBe(validDesc);
    // 5. Metadata URI carrying the mocked IPFS CID
    expect(scValToNative(contractArgs[4])).toBe(MOCK_METADATA_URI);
    // 6. Category symbol
    expect(scValToNative(contractArgs[5])).toBe("relief");
    // 7. Target amount in stroops (250 tokens * 10^7 = 2,500,000,000 stroops)
    expect(scValToNative(contractArgs[6])).toBe(2_500_000_000n);

    // 12. Assert navigation to newly created campaign page
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/campaign/42");
    });

    // 13. Assert form draft is cleared from sessionStorage
    expect(sessionStorage.getItem("create_campaign_draft")).toBeNull();
  });

  it("handles IPFS upload failure gracefully by surfacing the error and keeping submit disabled", async () => {
    // Override IPFS route to return a 500 error
    server.use(
      http.post("*/api/ipfs-upload", () => {
        return HttpResponse.json({ error: "Pinata IPFS service unavailable" }, { status: 500 });
      }),
    );

    renderCreateCampaignFlow();

    // Populate required fields
    fireEvent.change(screen.getByPlaceholderText(/Flood Relief 2024/i), {
      target: { value: "Water Relief Fund" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Provide a detailed description/i), {
      target: { value: "Providing clean drinking water across villages." },
    });
    fireEvent.change(screen.getByPlaceholderText("G..."), {
      target: { value: VALID_BENEFICIARY },
    });
    fireEvent.change(screen.getByPlaceholderText("1000"), {
      target: { value: "100" },
    });

    // Select valid image file that triggers failing upload
    const fileInput = screen.getByLabelText(/Campaign Cover Image/i);
    const validImage = new File(["image-bytes"], "banner.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [validImage] } });

    // Assert upload error is surfaced to user
    expect(await screen.findByText(/Upload failed\. Please try again\./i)).toBeInTheDocument();

    // Assert mutation was not called
    expect(submitTransactionMock).not.toHaveBeenCalled();
  });
});
