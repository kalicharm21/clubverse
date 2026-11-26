import React from 'react';
import {AlertTriangle} from 'lucide-react';
import {Button} from './Button.tsx';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{children: React.ReactNode}, State> {
  state: State = {hasError: false, message: ''};

  static getDerivedStateFromError(error: Error): State {
    return {hasError: true, message: error.message || 'An unexpected rendering error occurred.'};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
            <h2 className="mt-3 text-lg font-semibold text-slate-900">Something went wrong</h2>
            <p className="mt-1 text-sm text-slate-600">{this.state.message}</p>
            <div className="mt-5 flex justify-center">
              <Button onClick={() => window.location.reload()}>Reload Page</Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
