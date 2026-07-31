import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { InMemoryAdminUsers } from "../../src/data/firestore/admin-users.directory";

const coordinator = async () => ({ uid: "coord", role: "admin" as const, areas: ["agua", "obras"], accessLevel: "coordinator" as const });
describe("coordinator admin users API", () => {
  it("creates, lists, updates and disables operators without returning passwords", async () => {
    const users = new InMemoryAdminUsers(); const app = createApp({ authenticate: coordinator, adminUsers: users });
    const created = await request(app).post("/admin/usuarios").send({ email: "operador@durango.gob.mx", password: "DemoPass123!", name: "Operador Agua", areas: ["agua"], accessLevel: "operator" });
    expect(created.status).toBe(201); expect(created.body.user).toMatchObject({ id: expect.any(String), email: "operador@durango.gob.mx", name: "Operador Agua", active: true }); expect(created.body.user).not.toHaveProperty("password");
    expect((await request(app).get("/admin/usuarios")).body.users).toHaveLength(1);
    expect((await request(app).patch(`/admin/usuarios/${created.body.user.id}`).send({ name: "Nueva", areas: ["obras"], accessLevel: "coordinator" })).body.user).toMatchObject({ name: "Nueva", areas: ["obras"], accessLevel: "coordinator" });
    expect((await request(app).patch(`/admin/usuarios/${created.body.user.id}/estado`).send({ active: false })).body.user).toMatchObject({ active: false });
  });

  it("forbids operators from administering users", async () => {
    const app = createApp({ authenticate: async () => ({ uid: "op", role: "admin" as const, areas: ["agua"], accessLevel: "operator" as const }), adminUsers: new InMemoryAdminUsers() });
    expect((await request(app).get("/admin/usuarios")).status).toBe(403);
  });
});
