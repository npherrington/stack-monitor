import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'

import { Toaster } from '@/components/ui/toast.tsx'
import { ApiError } from '@/lib/api.ts'
import { ThemeProvider } from '@/providers/theme-provider.tsx'
import { router } from '@/router.tsx'

// A refusal (4xx) answers the same the second time, so only other failures get one retry. An
// action sent twice is a service started twice, so mutations never retry.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failures, error) =>
        failures < 1 && !(error instanceof ApiError && error.status < 500),
    },
    mutations: { retry: false },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Toaster limit={3}>
          <RouterProvider router={router} />
        </Toaster>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
