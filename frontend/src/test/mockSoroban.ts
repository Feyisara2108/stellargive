import { vi } from "vitest";

/**
 * Safe default return shapes for every hook exported by @/hooks/useSoroban.
 *
 * Hand-rolled `vi.mock("@/hooks/useSoroban", () => ({ ... }))` blocks that only
 * list the hooks a test cares about break with "No export is defined on the
 * mock" as soon as the component under test (or something it renders) starts
 * calling another hook — e.g. CampaignCard picking up useXlmPrice. This
 * factory mocks every exported hook with an inert default, so tests only need
 * to override the ones whose return value the test actually asserts on.
 */
export function createSorobanMock(overrides: Record<string, unknown> = {}) {
  const idleQuery = { data: undefined, isLoading: false, isFetching: false, isError: false, error: null };
  const idleMutation = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
  };

  return {
    // Query hooks
    useCampaign: vi.fn(() => ({ ...idleQuery })),
    useRecentCampaigns: vi.fn(() => ({ ...idleQuery, data: [] })),
    useCampaignsPaged: vi.fn(() => ({ ...idleQuery, data: { campaigns: [], hasMore: false } })),
    useUserCampaigns: vi.fn(() => ({ ...idleQuery, data: [] })),
    useActiveCampaigns: vi.fn(() => ({ ...idleQuery, data: [] })),
    useCampaignsByCategory: vi.fn(() => ({ ...idleQuery, data: [] })),
    useFilteredCampaigns: vi.fn(() => ({ ...idleQuery, data: [] })),
    usePlatformStats: vi.fn(() => ({
      ...idleQuery,
      data: { totalCampaigns: 0n, raisedByToken: {}, activeCampaigns: 0 },
    })),
    useUniqueDonors: vi.fn(() => ({ ...idleQuery, data: 0 })),
    usePlatformConfig: vi.fn(() => ({ ...idleQuery })),
    useEvents: vi.fn(() => ({ ...idleQuery, data: [], refetch: vi.fn() })),
    useGetUpdates: vi.fn(() => ({ ...idleQuery, data: [] })),
    useRefundEligibility: vi.fn(() => ({ ...idleQuery, data: false })),
    useDonateFeeEstimate: vi.fn(() => ({ ...idleQuery, data: null })),
    useWalletBalance: vi.fn(() => ({ ...idleQuery, data: null })),
    useResolvedName: vi.fn(() => ({ ...idleQuery, data: null })),
    useTokenMetadata: vi.fn(() => ({ ...idleQuery })),
    useTokenMetadataBatch: vi.fn(() => ({ ...idleQuery, data: {} })),
    useXlmPrice: vi.fn(() => ({ ...idleQuery })),

    // Mutation hooks
    useCreateCampaign: vi.fn(() => ({ ...idleMutation })),
    useDonate: vi.fn(() => ({ ...idleMutation })),
    useClaimFunds: vi.fn(() => ({ ...idleMutation })),
    useClaimRefund: vi.fn(() => ({ ...idleMutation })),
    useAddUpdate: vi.fn(() => ({ ...idleMutation })),
    useCancelCampaign: vi.fn(() => ({ ...idleMutation })),
    useAddToWhitelist: vi.fn(() => ({ ...idleMutation })),
    usePauseContract: vi.fn(() => ({ ...idleMutation })),
    useUnpauseContract: vi.fn(() => ({ ...idleMutation })),

    ...overrides,
  };
}
