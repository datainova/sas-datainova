import { useEffect } from "react";

import { LoginPage } from "./pages/LoginPage";
import { SignupCompletePage } from "./pages/SignupCompletePage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { ObjectivesWizardPage } from "./pages/wizard/ObjectivesWizardPage";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { PeriodsPage } from "./pages/manage/PeriodsPage";
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!isAuthenticated) {
      return;
    }
    const path = window.location.pathname;
    if ((path === "/" || path === "") && isAuthenticated) {
      window.location.replace("/app");
    }
  }, [isAuthenticated]);

  if (shouldRenderSignupComplete()) {
    return <SignupCompletePage />;
  }

  if (shouldRenderObjectivesWizard()) {
    return <ObjectivesWizardPage />;
  }

  if (shouldRenderOnboarding()) {
    return <OnboardingPage />;
  }

  if (shouldRenderManagePeriods()) {
    return <PeriodsPage />;
  }

  if (shouldRenderDashboard()) {
    return <DashboardPage />;
  }

  return <LoginPage />;
}

function shouldRenderOnboarding() {
  if (typeof window === "undefined") {
    return false;
  }
  const { pathname } = window.location;
  return pathname.startsWith("/onboarding");
}

function shouldRenderObjectivesWizard() {
  if (typeof window === "undefined") {
    return false;
  }
  const { pathname } = window.location;
  return pathname.startsWith("/wizard/objectives");
}

function shouldRenderHome() {
  if (typeof window === "undefined") return false;
  const { pathname } = window.location;
  return pathname === "/home";
}

function shouldRenderManagePeriods() {
  if (typeof window === "undefined") return false;
  const { pathname } = window.location;
  return pathname.startsWith("/manage/periods");
}

function shouldRenderDashboard() {
  if (typeof window === "undefined") return false;
  const { pathname } = window.location;
  return pathname === "/app" || pathname === "/dashboard";
}
