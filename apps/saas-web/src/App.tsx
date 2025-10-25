import { useEffect } from "react";
import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";

import { LoginPage } from "./pages/LoginPage";
import { SignupCompletePage } from "./pages/SignupCompletePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ObjectivesWizardPage } from "./pages/wizard/ObjectivesWizardPage";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { PeriodsPage } from "./pages/manage/PeriodsPage";
import ObjectivesPage from "./pages/manage/ObjectivesPage";
import IndicatorsPage from "./pages/manage/IndicatorsPage";
import { useAuthSession } from "./hooks/useAuthSession";

const SIGNUP_PATH_PREFIXES = [
  "/signup",
  "/auth/signup",
];

function shouldRenderSignupComplete() {
  if (typeof window === "undefined") {
    return false;
  }
  const { pathname, search } = window.location;
  if (pathname.startsWith("/signup/complete") || pathname.startsWith("/auth/signup/complete")) {
    return true;
  }
  if (SIGNUP_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const params = new URLSearchParams(search);
    return Boolean(params.get("token"));
  }
  return false;
}

export default function App() {
  const { isAuthenticated } = useAuthSession();
  return (
    <Routes>
      <Route path="/" element={isAuthenticated ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/home" element={<Navigate to="/app" replace />} />
      <Route path="/auth/signup/confirm" element={<SignupCompletePage />} />
      <Route path="/signup/complete" element={<SignupCompletePage />} />

      <Route element={<PrivateRoute />}> 
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/wizard/objectives">
          <Route index element={<ObjectivesWizardPage />} />
          <Route path=":periodId" element={<ObjectivesWizardPage />} />
        </Route>
        <Route path="/manage/periods" element={<PeriodsPage />} />
        <Route path="/manage/objectives" element={<ObjectivesPage />} />
        <Route path="/manage/indicators" element={<IndicatorsPage />} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? "/app" : "/"} replace />} />
    </Routes>
  );
}

function PrivateRoute() {
  const { isAuthenticated } = useAuthSession();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
