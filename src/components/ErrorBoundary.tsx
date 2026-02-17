import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40,
          fontFamily: 'monospace',
          backgroundColor: '#0a0a0a',
          color: '#ef4444',
          minHeight: '100vh',
        }}>
          <h1 style={{ color: '#f97316', marginBottom: 16 }}>CodeSync™ — Startup Error</h1>
          <p style={{ color: '#d1d5db', marginBottom: 8 }}>The application failed to load. Details below:</p>
          <pre style={{
            background: '#1a1a1a',
            padding: 16,
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: '60vh',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            {this.state.error?.toString()}
            {'\n\n'}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: '10px 24px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
