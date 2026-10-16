import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    // Forward to whatever error reporter is installed (Sentry, Datadog, etc.)
    // Consumers register a reporter via `window.__errorReporter = (e, info) => {}`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reporter = (window as any).__errorReporter as
      | ((err: Error, info: ErrorInfo) => void)
      | undefined;
    if (typeof reporter === 'function') {
      try {
        reporter(error, errorInfo);
      } catch {
        /* reporter itself threw — ignore */
      }
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isDev = import.meta.env.DEV;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-8 text-destructive" />
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">
          An unexpected error occurred while rendering this page. You can try again or navigate back
          to the dashboard.
        </p>

        {isDev && this.state.error && (
          <div className="mb-6 w-full max-w-lg rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-destructive">
              Error Details (dev only)
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            {this.state.error.stack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Stack trace
                </summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={this.handleReset}>
            <RotateCcw className="size-4" />
            Try Again
          </Button>
          <Button onClick={this.handleGoHome}>
            <Home className="size-4" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }
}
