import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletContext, useWallet } from '@/lib/WalletProvider';
import { useQuery } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

const ComponentModule20 = () => {
  const { isConnected, address } = useWallet();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [clicked, setClicked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['module20Data'],
    queryFn: async () => {
      return { message: 'Hello from query 20' };
    },
  });

  return (
    <div>
      <h1>Module 20</h1>
      {isConnected ? <p>Connected as {address}</p> : <p>Not connected</p>}
      {isLoading ? <p>Loading...</p> : <p>{data?.message}</p>}
      <input
        data-testid="mod20-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {isFocused && <span>Input is focused</span>}
      <button data-testid="mod20-button" onClick={() => setClicked(true)}>
        Click Me 20
      </button>
      {clicked && <span>Button was clicked</span>}
    </div>
  );
};

const renderWithProviders = (ui: React.ReactElement, walletValue: any) => {
  return render(<WalletContext.Provider value={walletValue}>{ui}</WalletContext.Provider>);
};

describe('ComponentModule20', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({
      data: { message: 'Hello from query 20' },
      isLoading: false,
    } as any);
  });

  it('renders correctly when not connected', async () => {
    renderWithProviders(<ComponentModule20 />, { isConnected: false, address: null });
    expect(screen.getByText('Module 20')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Hello from query 20')).toBeInTheDocument());
  });

  it('renders correctly when connected', async () => {
    renderWithProviders(<ComponentModule20 />, { isConnected: true, address: 'G123' });
    expect(screen.getByText('Connected as G123')).toBeInTheDocument();
  });

  it('handles focus and input interactions', async () => {
    renderWithProviders(<ComponentModule20 />, { isConnected: true, address: 'G123' });
    const input = screen.getByTestId('mod20-input');

    fireEvent.focus(input);
    expect(screen.getByText('Input is focused')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'test value' } });
    expect(input).toHaveProperty('value', 'test value');

    fireEvent.blur(input);
    expect(screen.queryByText('Input is focused')).not.toBeInTheDocument();
  });

  it('handles button click interaction', async () => {
    renderWithProviders(<ComponentModule20 />, { isConnected: true, address: 'G123' });
    const button = screen.getByTestId('mod20-button');

    fireEvent.click(button);
    expect(screen.getByText('Button was clicked')).toBeInTheDocument();
  });
});