import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { InitializationPrompt } from './InitializationPrompt';

describe('InitializationPrompt', () => {
  const defaultProps = {
    isVisible: true,
    isLoading: false,
    error: '',
    onInitialize: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when not visible', () => {
    render(<InitializationPrompt {...defaultProps} isVisible={false} />);
    
    expect(screen.queryByText('Game Setup Required')).not.toBeInTheDocument();
  });

  it('should render initialization prompt when visible', () => {
    render(<InitializationPrompt {...defaultProps} />);
    
    expect(screen.getByText('Game Setup Required')).toBeInTheDocument();
    expect(screen.getByText('Your game state needs to be initialized before you can start playing')).toBeInTheDocument();
    expect(screen.getByText('🚀 Initialize Game')).toBeInTheDocument();
  });

  it('should show what happens next section', () => {
    render(<InitializationPrompt {...defaultProps} />);
    
    expect(screen.getByText('What happens next?')).toBeInTheDocument();
    expect(screen.getByText('• Creates your personal game account on Gorbagana')).toBeInTheDocument();
    expect(screen.getByText('• Sets up initial game parameters')).toBeInTheDocument();
    expect(screen.getByText('• Enables slot machine functionality')).toBeInTheDocument();
    expect(screen.getByText('• One-time setup (small SOL fee for account creation)')).toBeInTheDocument();
  });

  it('should toggle technical details when clicked', async () => {
    render(<InitializationPrompt {...defaultProps} />);
    
    const detailsButton = screen.getByText('▶ Technical Details');
    expect(screen.queryByText('Account Address:')).not.toBeInTheDocument();
    
    fireEvent.click(detailsButton);
    
    await waitFor(() => {
      expect(screen.getByText('▼ Technical Details')).toBeInTheDocument();
      expect(screen.getByText(/Account Address:/)).toBeInTheDocument();
      expect(screen.getByText(/Cost:/)).toBeInTheDocument();
      expect(screen.getByText(/Security:/)).toBeInTheDocument();
    });
  });

  it('should call onInitialize when initialize button is clicked', () => {
    const mockOnInitialize = vi.fn();
    render(<InitializationPrompt {...defaultProps} onInitialize={mockOnInitialize} />);
    
    const initializeButton = screen.getByText('🚀 Initialize Game');
    fireEvent.click(initializeButton);
    
    expect(mockOnInitialize).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel button is clicked', () => {
    const mockOnCancel = vi.fn();
    render(<InitializationPrompt {...defaultProps} onCancel={mockOnCancel} />);
    
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    
    expect(mockOnCancel).toHaveBeenCalledTimes(1);
  });

  it('should show loading state when isLoading is true', () => {
    render(<InitializationPrompt {...defaultProps} isLoading={true} />);
    
    expect(screen.getByText('Initializing...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Initializing/ })).toBeDisabled();
  });

  it('should disable buttons when loading', () => {
    render(<InitializationPrompt {...defaultProps} isLoading={true} />);
    
    const initializeButton = screen.getByRole('button', { name: /Initializing/ });
    const cancelButton = screen.getByText('Cancel');
    
    expect(initializeButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();
  });

  it('should display error message when error is provided', () => {
    const errorMessage = 'Insufficient funds to initialize game state';
    render(<InitializationPrompt {...defaultProps} error={errorMessage} />);
    
    expect(screen.getByText('Initialization Failed')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('should not show cancel button when onCancel is not provided', () => {
    render(<InitializationPrompt {...defaultProps} onCancel={undefined} />);
    
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('should show help text', () => {
    render(<InitializationPrompt {...defaultProps} />);
    
    expect(screen.getByText('Need help? This is a one-time setup to enable blockchain gameplay')).toBeInTheDocument();
  });

  it('should have proper styling classes for different states', () => {
    const { rerender } = render(<InitializationPrompt {...defaultProps} />);
    
    // Normal state
    let initializeButton = screen.getByText('🚀 Initialize Game');
    expect(initializeButton).toHaveClass('bg-gradient-to-r', 'from-green-600', 'to-emerald-600');
    
    // Loading state
    rerender(<InitializationPrompt {...defaultProps} isLoading={true} />);
    initializeButton = screen.getByRole('button', { name: /Initializing/ });
    expect(initializeButton).toHaveClass('bg-gray-600', 'cursor-not-allowed');
  });

  it('should show spinning loader when loading', () => {
    render(<InitializationPrompt {...defaultProps} isLoading={true} />);
    
    const spinner = screen.getByRole('button', { name: /Initializing/ }).querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('should handle error display with warning icon', () => {
    const errorMessage = 'Network error occurred';
    render(<InitializationPrompt {...defaultProps} error={errorMessage} />);
    
    expect(screen.getByText('⚠️')).toBeInTheDocument();
    expect(screen.getByText('Initialization Failed')).toBeInTheDocument();
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });
});