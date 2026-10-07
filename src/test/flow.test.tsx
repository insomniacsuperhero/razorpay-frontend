import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BladeProvider } from '@razorpay/blade/components';
import { bladeTheme } from '@razorpay/blade/tokens';
import { DisputeWorkspace } from '../App';
import { createFakeApi, createFakeMerchant, sampleDetail } from '../dev/Preview';

function renderFlow(scenario = 'new') {
  const detail = sampleDetail(scenario);
  const api = createFakeApi(detail);
  const merchant = createFakeMerchant(detail);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<BladeProvider themeTokens={bladeTheme} colorScheme="light"><QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/d/x']}><Routes><Route path="/d/x/*" element={<DisputeWorkspace id="disp_SampleTk9x2Q" api={api} merchant={merchant} root="/d/x" expire={() => undefined} />} /></Routes></MemoryRouter>
  </QueryClientProvider></BladeProvider>);
  return api;
}
const file = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });

describe('seller flow (spec screens 1-7)', () => {
  it('goes from the dispute to a submitted response with the seller approving', async () => {
    renderFlow();
    expect(await screen.findByText('Customer says the order never arrived')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add proof from phone' }));
    expect(await screen.findByText(/Only the files you pick are read/)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('input-gallery'), { target: { files: [file('courier.jpg'), file('product.jpg')] } });
    expect(await screen.findByText('Delhivery tracking screenshot', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review evidence' })).toBeEnabled(), { timeout: 8000 });
    fireEvent.click(screen.getByRole('button', { name: 'Review evidence' }));
    expect(await screen.findByText('Delivery confirmation')).toBeInTheDocument();
    expect(screen.getAllByText('Not useful for this dispute').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to summary' }));
    expect(await screen.findByText('Good coverage')).toBeInTheDocument();
    expect(screen.getByText('Nothing is sent until you approve.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and submit' }));
    expect(await screen.findByText('Response sent', {}, { timeout: 5000 })).toBeInTheDocument();
  }, 30000);

  it('shows the bank request and the flagged card first', async () => {
    renderFlow('bank');
    expect(await screen.findByText('The bank asked for more proof')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add clearer proof' }));
    expect(await screen.findByText(/Bank: The delivery proof is unclear/)).toBeInTheDocument();
  });

  it('asks for confirmation before accepting', async () => {
    renderFlow();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept dispute' }));
    expect(await screen.findByText(/will be deducted from your settlements/)).toBeInTheDocument();
  });
});
