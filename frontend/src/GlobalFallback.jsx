import React from 'react'

function FallbackPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="card w-full max-w-lg p-8 text-center space-y-4">
        <div className="text-2xl font-heading text-duke-900">Something went wrong</div>
        <div className="text-sm text-slate-600">
          We are showing a safe fallback page while we recover.
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              window.location.href = '/login'
            }}
          >
            Go to Login
          </button>
        </div>
      </div>
    </div>
  )
}

export default class GlobalFallback extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
    this.onWindowError = this.onWindowError.bind(this)
    this.onUnhandledRejection = this.onUnhandledRejection.bind(this)
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidMount() {
    window.addEventListener('error', this.onWindowError)
    window.addEventListener('unhandledrejection', this.onUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onWindowError)
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection)
  }

  componentDidCatch() {
    // Prevent exposing stack traces to end users. Keep fallback-only experience.
  }

  onWindowError() {
    this.setState({ hasError: true })
  }

  onUnhandledRejection() {
    this.setState({ hasError: true })
  }

  render() {
    if (this.state.hasError) {
      return <FallbackPage />
    }

    return this.props.children
  }
}
