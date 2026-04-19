import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#0a0a0a', color: '#ef4444', fontFamily: 'monospace', padding: '2rem', minHeight: '100vh' }}>
          <h1 style={{ color: '#fff', marginBottom: '1rem' }}>⚠️ App Crashed</h1>
          <pre style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '8px', overflowX: 'auto', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
