import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RelativeTime } from './RelativeTime';
import '@testing-library/jest-dom';

describe('RelativeTime', () => {
  const SYSTEM_TIME = new Date('2026-06-24T12:00:00Z');

  beforeEach(() => {
    // Lock the system clock to a fixed base date for deterministic testing
    vi.useFakeTimers();
    vi.setSystemTime(SYSTEM_TIME);
  });

  afterEach(() => {
    // Clean up and restore real timers after each test
    vi.useRealTimers();
  });

  it('renders immediate state ("just now" / "less than a minute ago")', async () => {
    // Pass a timestamp just 5 seconds behind the locked system time
    const date = new Date(SYSTEM_TIME.getTime() - 5 * 1000);
    render(<RelativeTime date={date} />);
    
    // date-fns natively outputs "less than a minute ago", so we support both common formats
    expect(await screen.findByText(/less than a minute ago|just now/i)).toBeInTheDocument();
  });

  describe('Minute Range & Bound Check', () => {
    it('renders exactly 1 minute ago', async () => {
      // Exactly 60 seconds older
      const date = new Date(SYSTEM_TIME.getTime() - 60 * 1000);
      render(<RelativeTime date={date} />);
      
      expect(await screen.findByText(/1 minute ago/i)).toBeInTheDocument();
    });

    it('renders multiple minutes ago', async () => {
      // 15 minutes older
      const date = new Date(SYSTEM_TIME.getTime() - 15 * 60 * 1000);
      render(<RelativeTime date={date} />);
      
      expect(await screen.findByText(/15 minutes ago/i)).toBeInTheDocument();
    });
  });

  describe('Hour Range & Bound Check', () => {
    it('renders exactly 1 hour ago', async () => {
      // Exactly 60 minutes older
      const date = new Date(SYSTEM_TIME.getTime() - 60 * 60 * 1000);
      render(<RelativeTime date={date} />);
      
      // date-fns typically prefixes with "about" for hours
      expect(await screen.findByText(/about 1 hour ago|1 hour ago/i)).toBeInTheDocument();
    });

    it('renders multiple hours ago', async () => {
      // 5 hours older
      const date = new Date(SYSTEM_TIME.getTime() - 5 * 60 * 60 * 1000);
      render(<RelativeTime date={date} />);
      
      expect(await screen.findByText(/about 5 hours ago|5 hours ago/i)).toBeInTheDocument();
    });
  });

  describe('Day Range', () => {
    it('renders multiple days ago', async () => {
      // 3 days older
      const date = new Date(SYSTEM_TIME.getTime() - 3 * 24 * 60 * 60 * 1000);
      render(<RelativeTime date={date} />);
      
      expect(await screen.findByText(/3 days ago/i)).toBeInTheDocument();
    });
  });

  describe('Future Timestamps', () => {
    it('handles future timestamps correctly (e.g., in 10 minutes)', async () => {
      // 10 minutes into the future
      const date = new Date(SYSTEM_TIME.getTime() + 10 * 60 * 1000);
      render(<RelativeTime date={date} />);
      
      expect(await screen.findByText(/in 10 minutes/i)).toBeInTheDocument();
    });
  });
});
