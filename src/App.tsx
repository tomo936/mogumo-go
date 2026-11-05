import { RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { router } from './routes/router.tsx'

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
