import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-themes", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs",
    options: {},
  },
  // Inject placeholder values for the NEXT_PUBLIC_* env vars that
  // src/lib/soroban.ts reads at module load. Stories never make real
  // RPC calls, but the SDK initialises a client at import time, so the
  // vars need to be defined or that import will crash on undefined URLs.
  env: (config) => ({
    ...config,
    NEXT_PUBLIC_CONTRACT_ID:
      config.NEXT_PUBLIC_CONTRACT_ID ?? "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    NEXT_PUBLIC_SOROBAN_RPC_URL:
      config.NEXT_PUBLIC_SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org",
    NEXT_PUBLIC_NETWORK_PASSPHRASE:
      config.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
  }),
};

export default config;
