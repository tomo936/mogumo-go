import { createBrowserRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import { LoginPage } from './LoginPage.tsx'
import { MapPage } from './MapPage.tsx'
import { RequireAuth } from './RequireAuth.tsx'
import { SetupPage } from './SetupPage.tsx'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <MapPage /> },
      { path: '/setup', element: <SetupPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
