import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../app/AuthContext";
import AdminLogin from "./AdminLogin";

vi.mock("../services", () => ({ services: { auth: { currentUser: vi.fn().mockResolvedValue(null), onChange: vi.fn(() => () => undefined), login: vi.fn().mockResolvedValue({ uid: "coord", email: "coord@durango.gob.mx", role: "admin", accessLevel: "coordinator" }), logout: vi.fn() } } }));

describe("acceso administrativo demo", () => {
  it("permite entrar con las credenciales preparadas", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/login"]}>
          <AuthProvider>
            <Routes>
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<h1>Consola protegida</h1>} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.type(screen.getByLabelText("Correo electrónico"), "coord@durango.gob.mx");
    await userEvent.type(screen.getByLabelText("Contraseña"), "secreto-demo");
    await userEvent.click(screen.getByRole("button", { name: "Entrar a la consola" }));
    expect(await screen.findByRole("heading", { name: "Consola protegida" })).toBeInTheDocument();
  });
});
