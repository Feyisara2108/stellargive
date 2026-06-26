import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Footer } from './Footer';
import '@testing-library/jest-dom';

// Mock Next.js Link for consistent rendering
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the custom hook responsible for sourcing network status
// We use a generic hooks directory import assuming a standard Next.js / React project structure
vi.mock('@/hooks/useRpcHealth', () => ({
  useRpcHealth: vi.fn(),
}));

import { useRpcHealth } from '@/hooks/useRpcHealth';

describe('Footer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static Footprint & Link Verifications', () => {
    it('renders core navigational elements with expected href attributes', () => {
      // Setup a default healthy state for the structural tests
      vi.mocked(useRpcHealth).mockReturnValue({
        status: 'healthy',
        latency: 45,
      });

      render(<Footer />);

      // Query core navigational elements and assert correct destinations
      const termsLink = screen.getByRole('link', { name: /terms of service/i });
      expect(termsLink).toBeInTheDocument();
      expect(termsLink).toHaveAttribute('href', '/terms');

      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute('href', '/privacy');

      const aboutLink = screen.getByRole('link', { name: /about us/i });
      expect(aboutLink).toBeInTheDocument();
      expect(aboutLink).toHaveAttribute('href', '/about');
    });
  });

  describe('RPC Health Status Tracking', () => {
    it('reflects a Healthy state configuration', () => {
      // Configure mock hook to emit healthy status
      vi.mocked(useRpcHealth).mockReturnValue({
        status: 'healthy',
        latency: 45,
      });

      render(<Footer />);

      // Verify accessible label
      const healthIndicator = screen.getByLabelText(/rpc node status: healthy/i);
      expect(healthIndicator).toBeInTheDocument();
      
      // Assert specific green-themed CSS classes for healthy status
      expect(healthIndicator.className).toMatch(/bg-green|text-green/i);
    });

    it('reflects a Degraded state configuration', () => {
      // Configure mock hook to emit degraded status
      vi.mocked(useRpcHealth).mockReturnValue({
        status: 'degraded',
        latency: 850,
      });

      render(<Footer />);

      // Verify accessible label updates
      const healthIndicator = screen.getByLabelText(/rpc node status: degraded/i);
      expect(healthIndicator).toBeInTheDocument();
      
      // Assert visual shift to yellow/amber attributes
      expect(healthIndicator.className).toMatch(/bg-yellow|text-yellow|bg-amber|text-amber/i);
    });

    it('reflects a Down state configuration', () => {
      // Configure mock hook to emit down status
      vi.mocked(useRpcHealth).mockReturnValue({
        status: 'down',
        latency: 0,
      });

      render(<Footer />);

      // Verify accessible label announces outage cleanly
      const healthIndicator = screen.getByLabelText(/rpc node status: down/i);
      expect(healthIndicator).toBeInTheDocument();
      
      // Assert critical system alert state layout (red or gray)
      expect(healthIndicator.className).toMatch(/bg-red|text-red|bg-gray|text-gray|bg-destructive|text-destructive/i);
    });
  });
});
