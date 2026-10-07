import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="state"><h1>We could not display this screen</h1><p>Your uploaded proof stays on the server. Reload to retrieve the latest status.</p><button className="recovery-button" onClick={() => window.location.reload()}>Reload screen</button></main>;
    return this.props.children;
  }
}
