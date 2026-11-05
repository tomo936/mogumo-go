import { createBrowserRouter, Navigate } from 'react-router'
import type { RouteObject } from 'react-router'
import { CharacterPage } from '../setup/ui/CharacterPage.tsx'
import { HomePage } from '../setup/ui/HomePage.tsx'
import { NamePage } from '../setup/ui/NamePage.tsx'
import { RedirectIfSetupDone, RequireSetupDone, SetupStatusLayout } from '../setup/ui/SetupGate.tsx'
import { LoginPage } from './LoginPage.tsx'
import { MapPage } from './MapPage.tsx'
import { RequireAuth } from './RequireAuth.tsx'

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <SetupStatusLayout />,
        children: [
          { element: <RequireSetupDone />, children: [{ path: '/', element: <MapPage /> }] },
          {
            path: '/setup',
            element: <RedirectIfSetupDone />,
            children: [
              { index: true, element: <Navigate to="name" replace /> },
              { path: 'name', element: <NamePage /> },
              { path: 'character', element: <CharacterPage /> },
              { path: 'home', element: <HomePage /> },
            ],
          },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
