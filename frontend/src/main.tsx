import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import { ApiError } from './lib/api'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        // 429 is temporary: wait as the server asks. Other 4xx responses will not change on retry.
        if (err instanceof ApiError && err.status === 429) return count < 4
        return !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2
      },
      retryDelay: (count, err) => {
        const wait = err instanceof ApiError ? Number(err.details.retry_after_seconds) : NaN
        return Number.isFinite(wait) && wait > 0 ? Math.min(wait, 30) * 1000 : Math.min(1000 * 2 ** count, 30_000)
      },
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
