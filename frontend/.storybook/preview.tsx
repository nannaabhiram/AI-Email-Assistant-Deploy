import type { Decorator, Preview } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '../src/components/ui/Toast'
import { ThemeProvider } from '../src/hooks/useTheme'
import '../src/index.css'

function StoryShell({ theme, children }: { theme: 'light' | 'dark'; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider key={theme} initial={theme}>
        <ToastProvider>
          <MemoryRouter>
            <div className="bg-bg p-4 text-fg">{children}</div>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const withProviders: Decorator = (Story, context) => {
  const theme = (context.globals.theme as 'light' | 'dark' | undefined) ?? 'light'
  return <StoryShell theme={theme}><Story /></StoryShell>
}

const preview: Preview = {
  decorators: [withProviders],
  globalTypes: {
    theme: {
      description: 'Color theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
    viewport: {
      options: {
        mobile: { name: 'Mobile', styles: { width: '375px', height: '740px' } },
        tablet: { name: 'Tablet', styles: { width: '820px', height: '1080px' } },
      },
    },
  },
}

export default preview
