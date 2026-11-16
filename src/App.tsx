import { RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { Splash } from './credits/Splash.tsx'
import { router } from './routes/router.tsx'
import { MaintenanceGate } from './maintenance/ui/MaintenanceGate.tsx'

export function App() {
  return (
    <MaintenanceGate>
      <AuthProvider>
        <RouterProvider router={router} />
        <Splash />
      </AuthProvider>
    </MaintenanceGate>
  )
}
