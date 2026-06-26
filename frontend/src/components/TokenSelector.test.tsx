import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TokenSelector, PREDEFINED_TOKENS } from './TokenSelector';
import '@testing-library/jest-dom';

// Mock external dependencies
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader2-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Check: () => <div data-testid="check-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  Coins: () => <div data-testid="coins-icon" />,
}));

jest.mock('@/lib/soroban', () => ({
  getTokenMetadata: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TokenSelector', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Default & Selected State Assertion', () => {
    // Render pre-selecting the first token (XLM)
    const selectedToken = PREDEFINED_TOKENS[0];
    render(<TokenSelector value={selectedToken.address} onChange={mockOnChange} />);

    // Assert that the component correctly displays the selected token symbol
    expect(screen.getByText(selectedToken.symbol)).toBeInTheDocument();
    
    // Check if the truncated address is also present
    const truncatedAddress = `${selectedToken.address.slice(0, 6)}...${selectedToken.address.slice(-6)}`;
    expect(screen.getByText(`(${truncatedAddress})`)).toBeInTheDocument();
  });

  test('Available Token List Rendering', () => {
    // Render with no token selected
    render(<TokenSelector value="" onChange={mockOnChange} />);

    // Assert the default placeholder is shown
    expect(screen.getByText(/Select a token/i)).toBeInTheDocument();

    // Open the dropdown
    const selectButton = screen.getByRole('button', { name: /Select a token/i });
    fireEvent.click(selectButton);

    // Assert that all predefined tokens are visibly rendered
    PREDEFINED_TOKENS.forEach((token) => {
      // Because the text is split across different spans inside the button, 
      // we check for both symbol and name texts to exist.
      expect(screen.getByText(token.symbol)).toBeInTheDocument();
      expect(screen.getByText(token.name)).toBeInTheDocument();
    });
  });

  test('Change Handler Invocation', () => {
    // Render pre-selecting the first token
    const firstToken = PREDEFINED_TOKENS[0];
    render(<TokenSelector value={firstToken.address} onChange={mockOnChange} />);

    // Open the dropdown. Since a token is selected, the button contains the symbol text.
    const selectButton = screen.getByRole('button', { name: new RegExp(firstToken.symbol, 'i') });
    fireEvent.click(selectButton);

    // Simulate clicking a different token (e.g., USDC)
    const usdcToken = PREDEFINED_TOKENS.find(t => t.symbol === 'USDC') || PREDEFINED_TOKENS[1];
    
    // Find the option button for the new token by looking for its name content
    const usdcOption = screen.getByText(usdcToken.name).closest('button');
    expect(usdcOption).toBeInTheDocument();
    
    if (usdcOption) {
      fireEvent.click(usdcOption);
    }

    // Assert that onChange was called exactly once with the correct address
    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith(usdcToken.address);
  });
});
