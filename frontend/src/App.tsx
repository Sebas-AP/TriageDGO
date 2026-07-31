import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./app/ProtectedRoute";
import { AppLoader } from "./components/AppLoader";
import { ToastViewport } from "./components/ToastViewport";

const ReportWizard = lazy(() => import("./components/wizard/ReportWizard"));
const AdminConsole = lazy(() => import("./components/admin/AdminConsole"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const ReportStatusPage = lazy(() => import("./pages/ReportStatusPage"));

function Stage({ children }: { children: React.ReactNode }) {
  return <div className="route-stage">{children}</div>;
}

export default function App() {
  return (
    <Suspense fallback={<AppLoader />}>
      <Routes>
        <Route path="/" element={<Stage><ReportWizard /></Stage>} />
        <Route path="/reporte/:folio" element={<Stage><ReportStatusPage /></Stage>} />
        <Route path="/admin/login" element={<Stage><AdminLogin /></Stage>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<Stage><AdminConsole /></Stage>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastViewport />
    </Suspense>
  );
}
