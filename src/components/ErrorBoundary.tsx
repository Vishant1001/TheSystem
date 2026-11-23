import { Component, type ReactNode } from 'react';
import { systemCopy } from '../copy/system';
import { SystemErrorPanel, SystemScreenState } from './SystemStates';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * When this changes the boundary clears itself. The shell passes the route,
   * so navigating away from a broken screen recovers without a reload.
   */
  resetKey?: string;
  /** 'screen' fills the viewport; 'inline' sits inside the shell. */
  layout?: 'screen' | 'inline';
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Brief 7.4: errors in the System's voice, never raw exception text. Query
 * and mutation failures already have their own states; this catches what
 * escapes them - a render that throws - so the app shows a System window
 * instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    // For us, in development. The hunter only ever sees the System window.
    if (import.meta.env.DEV) {
      console.error('[system] render error caught by boundary:', error);
    }
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  private readonly retry = (): void => {
    if (this.props.layout === 'screen') {
      window.location.reload();
      return;
    }
    this.setState({ failed: false });
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    const panel = <SystemErrorPanel message={systemCopy.errors.crashed} onRetry={this.retry} />;
    return this.props.layout === 'screen' ? <SystemScreenState>{panel}</SystemScreenState> : panel;
  }
}
