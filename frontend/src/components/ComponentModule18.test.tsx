import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletContext, useWallet } from '@/lib/WalletProvider';
import { useQuery } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

const ComponentModule18 = () => {
  const { isConnected, address } = useWallet();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [clicked, setClicked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['module18Data'],
    queryFn: async () => {
      return { message: 'Hello from query 18' };
    },
  });

  return (
    <div>
      <h1>Module 18</h1>
      {isConnected ? <p>Connected as {address}</p> : <p>Not connected</p>}
      {isLoading ? <p>Loading...</p> : <p>{data?.message}</p>}
      <input
        data-testid="mod18-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {isFocused && <span>Input is focused</span>}
      <button data-testid="mod18-button" onClick={() => setClicked(true)}>
        Click Me 18
      </button>
      {clicked && <span>Button was clicked</span>}
    </div>
  );
};

const renderWithProviders = (ui: React.ReactElement, walletValue: any) => {
  return render(<WalletContext.Provider value={walletValue}>{ui}</WalletContext.Provider>);
};

describe('ComponentModule18', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({
      data: { message: 'Hello from query 18' },
      isLoading: false,
    } as any);
  });

  it('renders correctly when not connected', async () => {
    renderWithProviders(<ComponentModule18 />, { isConnected: false, address: null });
    expect(screen.getByText('Module 18')).toBeInTheDocument();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Hello from query 18')).toBeInTheDocument());
  });

  it('renders correctly when connected', async () => {
    renderWithProviders(<ComponentModule18 />, { isConnected: true, address: 'G123' });
    expect(screen.getByText('Connected as G123')).toBeInTheDocument();
  });

  it('handles focus and input interactions', async () => {
    renderWithProviders(<ComponentModule18 />, { isConnected: true, address: 'G123' });
    const input = screen.getByTestId('mod18-input');

    fireEvent.focus(input);
    expect(screen.getByText('Input is focused')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'test value' } });
    expect(input).toHaveProperty('value', 'test value');

    fireEvent.blur(input);
    expect(screen.queryByText('Input is focused')).not.toBeInTheDocument();
  });

  it('handles button click interaction', async () => {
    renderWithProviders(<ComponentModule18 />, { isConnected: true, address: 'G123' });
    const button = screen.getByTestId('mod18-button');

    fireEvent.click(button);
    expect(screen.getByText('Button was clicked')).toBeInTheDocument();
  });
});