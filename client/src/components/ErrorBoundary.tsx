import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="container-page flex min-h-[50vh] flex-col items-center justify-center text-center">
          <h1 className="text-xl font-semibold text-slate-900">Что-то пошло не так</h1>
          <p className="mt-2 text-sm text-slate-600">
            Произошла непредвиденная ошибка. Попробуйте обновить страницу.
          </p>
          {this.state.error && (
            <p className="mt-2 rounded bg-red-50 px-3 py-1 text-xs text-red-600">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={this.handleReset}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Попробовать снова
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              На главную
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
