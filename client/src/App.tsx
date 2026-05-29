import { Switch, Route, Router, Redirect } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/auth";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import Welcome from "@/pages/welcome";
import AstReportHome from "@/pages/ast-report-home";
import AstSettingsPage from "@/pages/ast-settings";
import AstFormEditorPage from "@/pages/ast-form-editor";
import NewCaseHome from "@/pages/new-case-home";
import HospitalFormEditorPage from "@/pages/hospital-form-editor";
import HospitalSettingsPage from "@/pages/hospital-settings";
import HospitalTreatmentSettingsPage from "@/pages/hospital-treatment-settings";
import HospitalTreatmentMedicationsPage from "@/pages/hospital-treatment-medications";
import HospitalTreatmentRoutesPage from "@/pages/hospital-treatment-routes";
import HospitalTreatmentFrequenciesPage from "@/pages/hospital-treatment-frequencies";
import HospitalTreatmentDoseUnitsPage from "@/pages/hospital-treatment-dose-units";
import HospitalTreatmentDurationsPage from "@/pages/hospital-treatment-durations";
import HospitalVeterinariansPage from "@/pages/hospital-veterinarians";
import RegisterCase from "@/pages/register-case";
import CaseList from "@/pages/case-list";
import CaseView from "@/pages/case-view";
import PrintReport from "@/pages/print-report";
import BreakpointsPage from "@/pages/breakpoints";
import AdminPanel from "@/pages/admin";
import ExportDataPage from "@/pages/export-data";
import HospitalExportDataPage from "@/pages/hospital-export-data";
import DashboardPage from "@/pages/dashboard";
import HospitalDashboardPage from "@/pages/hospital-dashboard";
import NotFound from "@/pages/not-found";
import { DeepASTAttribution } from "@/components/DeepASTAttribution";
import ProfilePage from "@/pages/profile";

function ProtectedRoutes() {
  const {
    user,
    isAdmin,
    isStudent,
    canRegisterAstCase,
    canRegisterHospitalCase,
    canViewAstCases,
    canViewHospitalCases,
    canExportAst,
    canExportHospital,
    canViewDashboard,
    canViewVthDashboard,
    canManageAstAdmin,
    isLoading,
  } = useAuth();

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
          <Route path="/new-case" component={NewCaseHome} />
          <Route path="/new-case/form-editor">
            {canManageAstAdmin ? <HospitalFormEditorPage /> : <Redirect to="/new-case" />}
          </Route>
          <Route path="/new-case/settings">
            {canManageAstAdmin ? <HospitalSettingsPage /> : <Redirect to="/new-case" />}
          </Route>
          <Route path="/new-case/settings/treatment">
            {canManageAstAdmin ? <HospitalTreatmentSettingsPage /> : <Redirect to="/new-case" />}
          </Route>
          <Route path="/new-case/settings/treatment/medications">
            {canManageAstAdmin ? <HospitalTreatmentMedicationsPage /> : <Redirect to="/new-case/settings/treatment" />}
          </Route>
          <Route path="/new-case/settings/treatment/routes">
            {canManageAstAdmin ? <HospitalTreatmentRoutesPage /> : <Redirect to="/new-case/settings/treatment" />}
          </Route>
          <Route path="/new-case/settings/treatment/frequencies">
            {canManageAstAdmin ? <HospitalTreatmentFrequenciesPage /> : <Redirect to="/new-case/settings/treatment" />}
          </Route>
          <Route path="/new-case/settings/treatment/dose-units">
            {canManageAstAdmin ? <HospitalTreatmentDoseUnitsPage /> : <Redirect to="/new-case/settings/treatment" />}
          </Route>
          <Route path="/new-case/settings/treatment/durations">
            {canManageAstAdmin ? <HospitalTreatmentDurationsPage /> : <Redirect to="/new-case/settings/treatment" />}
          </Route>
          <Route path="/new-case/settings/veterinarians">
            {canManageAstAdmin ? <HospitalVeterinariansPage /> : <Redirect to="/new-case/settings" />}
          </Route>
          <Route path="/new-case/register">
            {canRegisterHospitalCase ? (
              <RegisterCase
                pageTitle="Register New Hospital Case"
                backHref="/new-case"
                onSuccessRedirect="/new-case"
                mode="hospital"
                createEndpoint="/api/cases"
                caseScope="hospital"
              />
            ) : (
              <Redirect to="/new-case" />
            )}
          </Route>
          <Route path="/ast-report" component={AstReportHome} />
          <Route path="/ast-report/settings">
            {canManageAstAdmin ? <AstSettingsPage /> : <Redirect to="/ast-report" />}
          </Route>
          {isAdmin && (
            <Route path="/ast-report/form-editor" component={AstFormEditorPage} />
          )}
          <Route path="/profile" component={ProfilePage} />
          {canRegisterAstCase && !isStudent && (
            <Route path="/register">
              <RegisterCase
                createEndpoint="/api/ast/cases"
                caseScope="ast"
                backHref="/ast-report"
                onSuccessRedirect="/ast-report"
              />
            </Route>
          )}
          <Route path="/new-case/cases">
            {canViewHospitalCases ? (
              <CaseList backHref="/new-case" scope="hospital" />
            ) : (
              <Redirect to="/new-case" />
            )}
          </Route>
          <Route path="/ast-report/cases">
            {canViewAstCases ? (
              <CaseList backHref="/ast-report" scope="ast" />
            ) : (
              <Redirect to="/ast-report" />
            )}
          </Route>
          <Route path="/cases">
            <Redirect to="/ast-report/cases" />
          </Route>
          <Route path="/dashboard">
            {canViewDashboard ? (
              <DashboardPage
                scope="ast"
                title="AMR Statistical Dashboard"
                subtitle="Veterinary AST surveillance dashboard"
                backHref="/ast-report"
              />
            ) : (
              <Redirect to="/ast-report" />
            )}
          </Route>
          <Route path="/new-case/dashboard">
            {canViewVthDashboard ? <HospitalDashboardPage /> : <Redirect to="/new-case" />}
          </Route>
          <Route path="/ast-report/cases/:id">
            {canViewAstCases ? <CaseView /> : <Redirect to="/ast-report/cases" />}
          </Route>
          <Route path="/new-case/cases/:id">
            {canViewHospitalCases ? <CaseView /> : <Redirect to="/new-case/cases" />}
          </Route>
          <Route path="/ast-report/print/:id">
            {canViewAstCases ? <PrintReport /> : <Redirect to="/ast-report/cases" />}
          </Route>
          <Route path="/new-case/print/:id">
            {canViewHospitalCases ? <PrintReport /> : <Redirect to="/new-case/cases" />}
          </Route>
          <Route path="/cases/:id">
            <Redirect to="/ast-report/cases" />
          </Route>
          <Route path="/print/:id">
            <Redirect to="/ast-report/cases" />
          </Route>
          <Route path="/export">
            {canExportAst ? <ExportDataPage /> : <Redirect to="/ast-report" />}
          </Route>
          <Route path="/new-case/export">
            {canExportHospital ? <HospitalExportDataPage /> : <Redirect to="/new-case" />}
          </Route>
          {canManageAstAdmin && <Route path="/breakpoints" component={BreakpointsPage} />}
          {isAdmin && (
            <Route path="/admin/downloads">
              <AdminPanel forcedTab="downloads" />
            </Route>
          )}
          {isAdmin && (
            <Route path="/admin">
              <AdminPanel />
            </Route>
          )}
          <Route path="/login">
            <Redirect to="/" />
          </Route>
          <Route path="/signup">
            <Redirect to="/" />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
      <footer className="no-print border-t border-border py-2 text-center text-[11px] text-muted-foreground/70 space-y-0.5">
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