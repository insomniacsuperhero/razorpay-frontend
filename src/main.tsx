import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/react';
import { App } from './App';
import { consumeLinkToken } from './auth/session';
import '@razorpay/blade/fonts.css';
import './styles.css';
const linkToken = consumeLinkToken();
/** Vercel Web Analytics: page views only. Alert links carry a single-use sign-in token (?t=); it is
 *  stripped from the URL before render, and again here so it can never reach analytics. */
const scrub = (event: BeforeSendEvent) => {
  const url = new URL(event.url);
  url.searchParams.delete('t');
  return { ...event, url: url.toString() };
};
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: false } } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App initialLinkToken={linkToken}/></BrowserRouter></QueryClientProvider><Analytics beforeSend={scrub}/></React.StrictMode>);

// Service worker for phone notifications (Web Push). Registered everywhere it is supported; it caches nothing.
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
