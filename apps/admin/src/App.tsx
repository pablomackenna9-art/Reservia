import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { CuentaPage } from "./features/auth/CuentaPage";
import { RestaurantProvider } from "./features/restaurants/RestaurantProvider";
import { PaginaReservasPage } from "./features/booking/PaginaReservasPage";
import { RestaurantesPage } from "./features/restaurants/RestaurantesPage";
import { OnboardingPage } from "./features/restaurants/OnboardingPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { NotificacionesPage } from "./features/notifications/NotificacionesPage";
import { PlanoDeMesasPage } from "./features/plano/PlanoDeMesasPage";
import { ReservasPage } from "./features/reservations/ReservasPage";
import { ClientesPage } from "./features/customers/ClientesPage";
import { ConfiguracionPage } from "./features/config/ConfiguracionPage";
import { ListaDeEsperaPage } from "./features/waitlist/ListaDeEsperaPage";
import { ReportesPage } from "./features/reports/ReportesPage";
import { IntegracionesPage } from "./features/integrations/IntegracionesPage";
import { MarketingPage } from "./features/marketing/MarketingPage";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RequireRestaurant } from "./routes/RequireRestaurant";

function Protected({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <RequireRestaurant>
        <AppLayout>{children}</AppLayout>
      </RequireRestaurant>
    </ProtectedRoute>
  );
}

/** Pantallas que funcionan aunque la cuenta todavía no tenga un restaurante activo (panel de administración, mi cuenta). */
function ProtectedLoose({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <AuthProvider>
      <RestaurantProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
            <Route
              path="/restaurantes"
              element={
                <ProtectedLoose>
                  <RestaurantesPage />
                </ProtectedLoose>
              }
            />
            <Route
              path="/cuenta"
              element={
                <ProtectedLoose>
                  <CuentaPage />
                </ProtectedLoose>
              }
            />
            <Route
              path="/pagina-de-reservas"
              element={
                <Protected>
                  <PaginaReservasPage />
                </Protected>
              }
            />
            <Route
              path="/plano-de-mesas"
              element={
                <Protected>
                  <PlanoDeMesasPage />
                </Protected>
              }
            />
            <Route
              path="/notificaciones"
              element={
                <Protected>
                  <NotificacionesPage />
                </Protected>
              }
            />
            <Route
              path="/reservas"
              element={
                <Protected>
                  <ReservasPage />
                </Protected>
              }
            />
            <Route
              path="/lista-de-espera"
              element={
                <Protected>
                  <ListaDeEsperaPage />
                </Protected>
              }
            />
            <Route
              path="/clientes"
              element={
                <Protected>
                  <ClientesPage />
                </Protected>
              }
            />
            <Route
              path="/configuracion"
              element={
                <Protected>
                  <ConfiguracionPage />
                </Protected>
              }
            />
            <Route
              path="/reportes"
              element={
                <Protected>
                  <ReportesPage />
                </Protected>
              }
            />
            <Route
              path="/integraciones"
              element={
                <Protected>
                  <IntegracionesPage />
                </Protected>
              }
            />
            <Route
              path="/marketing"
              element={
                <Protected>
                  <MarketingPage />
                </Protected>
              }
            />
          </Routes>
        </BrowserRouter>
      </RestaurantProvider>
    </AuthProvider>
  );
}
