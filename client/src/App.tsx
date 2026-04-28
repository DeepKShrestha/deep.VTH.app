import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import Welcome from "@/pages/welcome";
import RegisterCase from "@/pages/register-case";
import CaseList from "@/pages/case-list";
import CaseView from "@/pages/case-view";
import PrintReport from "@/pages/print-report";
import BreakpointsPage from "@/pages/breakpoints";
import AdminPanel from "@/pages/admin";
import ExportDataPage from "@/pages/export-data";
import DashboardPage from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { DeepASTAttribution } from "@/components/DeepASTAttribution";
import ProfilePage from "./pages/profile";

function ProtectedRoutes() {
  const { user, isAdmin, canRegisterCase, canViewDashboard, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Restoring session...
      </div>
    );
  }

  // If not logged in, always send to login/signup
  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  // Logged-in routes
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Welcome} />
          <Route path="/profile" component={ProfilePage} />
          {canRegisterCase && <Route path="/register" component={RegisterCase} />}
          <Route path="/cases" component={CaseList} />
          <Route path="/dashboard">
            {canViewDashboard ? <DashboardPage /> : <Redirect to="/" />}
          </Route>
          <Route path="/cases/:id" component={CaseView} />
          <Route path="/print/:id" component={PrintReport} />
          <Route path="/export" component={ExportDataPage} />
          {isAdmin && <Route path="/breakpoints" component={BreakpointsPage} />}
          {isAdmin && <Route path="/admin" component={AdminPanel} />}
          <Route path="/login">
            <Redirect to="/" />
          </Route>
          <Route path="/signup">
            <Redirect to="/" />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <footer className="no-print border-t border-border py-3 text-center text-xs text-muted-foreground space-y-1">
        <DeepASTAttribution />
        <div>
          © {new Date().getFullYear()} Deep Kumar Shrestha, B.V.Sc &amp; AH, 9th
          Batch. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function AppRouter() {
  return (
    <>
      <ProtectedRoutes />
      <Toaster />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;