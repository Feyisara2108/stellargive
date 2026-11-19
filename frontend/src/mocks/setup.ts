import { setupServer } from "msw/node";
import { handlers, resetMockCampaigns } from "./handlers";

export const server = setupServer(...handlers);

// Re-export for convenience: tests can import server + errorHandlers from one place.
export { errorHandlers } from "./handlers";

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
  resetMockCampaigns();
});

afterAll(() => {
  server.close();
});
