import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoadingSkeleton } from '@/components/ui/States'
import { useAuth } from '@/hooks/useAuth'
import { supabaseConfigured } from '@/lib/supabase'
import LoginPage from '@/pages/LoginPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const InboxPage = lazy(() => import('@/pages/InboxPage'))
const EmailDetailPage = lazy(() => import('@/pages/EmailDetailPage'))
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const TasksPage = lazy(() => import('@/pages/TasksPage'))
const DraftsPage = lazy(() => import('@/pages/DraftsPage'))
const ApprovalsPage = lazy(() => import('@/pages/ApprovalsPage'))
const BriefingsPage = lazy(() => import('@/pages/BriefingsPage'))
const AttachmentsPage = lazy(() => import('@/pages/AttachmentsPage'))
const ContactsPage = lazy(() => import('@/pages/ContactsPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const AccountSettingsPage = lazy(() => import('@/pages/AccountSettingsPage'))
const PreferencesPage = lazy(() => import('@/pages/PreferencesPage'))
const OrganizePage = lazy(() => import('@/pages/OrganizePage'))

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, recovering } = useAuth()
  const location = useLocation()
  if (recovering) return <Navigate to="/reset-password" replace />
  if (loading) return <div className="p-8"><LoadingSkeleton lines={4} label="Checking your session" /></div>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

function NotConfigured() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold text-fg">Frontend not configured</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Set <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> and <code>VITE_API_BASE_URL</code> in
        <code> frontend/.env.local</code> (see <code>frontend/.env.example</code>) and restart the dev server.
      </p>
    </main>
  )
}

export default function App() {
  if (!supabaseConfigured) return <NotConfigured />
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-8"><LoadingSkeleton lines={5} label="Loading page" /></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/inbox/:id" element={<EmailDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/drafts" element={<DraftsPage />} />
            <Route path="/drafts/:id" element={<DraftsPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/briefings" element={<BriefingsPage />} />
            <Route path="/attachments" element={<AttachmentsPage />} />
            <Route path="/organize" element={<OrganizePage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/contacts/:id" element={<ContactsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings/accounts" element={<AccountSettingsPage />} />
            <Route path="/settings/preferences" element={<PreferencesPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
