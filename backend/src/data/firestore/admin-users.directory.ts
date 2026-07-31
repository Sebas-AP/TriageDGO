import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getApps } from "firebase-admin/app";
import { firestore } from "./firebase";

export interface AdminUser { id: string; email: string; name: string; areas: string[]; accessLevel: "operator" | "coordinator"; active: boolean; }
export interface CreateAdminUser extends Omit<AdminUser, "id" | "active"> { password: string; }
export interface AdminUsersDirectory { list(): Promise<AdminUser[]>; create(input: CreateAdminUser): Promise<AdminUser>; update(id: string, input: Partial<Pick<AdminUser, "name" | "areas" | "accessLevel">>): Promise<AdminUser | undefined>; setActive(id: string, active: boolean): Promise<AdminUser | undefined>; }

export class InMemoryAdminUsers implements AdminUsersDirectory {
  private readonly users = new Map<string, AdminUser>();
  async list() { return [...this.users.values()].sort((a, b) => a.name.localeCompare(b.name)); }
  async create(input: CreateAdminUser) { const user: AdminUser = { id: randomUUID(), email: input.email, name: input.name, areas: [...input.areas], accessLevel: input.accessLevel, active: true }; this.users.set(user.id, user); return user; }
  async update(id: string, input: Partial<Pick<AdminUser, "name" | "areas" | "accessLevel">>) { const user = this.users.get(id); if (!user) return undefined; Object.assign(user, input); return user; }
  async setActive(id: string, active: boolean) { const user = this.users.get(id); if (!user) return undefined; user.active = active; return user; }
}

/** Firebase Auth + Firestore profile adapter. Kept behind an interface for HTTP/unit tests. */
export class FirebaseAdminUsersDirectory implements AdminUsersDirectory {
  private readonly db = firestore();
  private readonly auth = getAuth(getApps()[0]);
  async list() { const snapshot = await this.db.collection("usuarios").where("rol", "==", "admin").get(); return snapshot.docs.map((doc) => toUser(doc.id, doc.data())); }
  async create(input: CreateAdminUser) { const authUser = await this.auth.createUser({ email: input.email, password: input.password, displayName: input.name, disabled: false }); const user: AdminUser = { id: authUser.uid, email: input.email, name: input.name, areas: input.areas, accessLevel: input.accessLevel, active: true }; await this.auth.setCustomUserClaims(user.id, claims(user)); await this.db.collection("usuarios").doc(user.id).set({ ...user, rol: "admin" }); return user; }
  async update(id: string, input: Partial<Pick<AdminUser, "name" | "areas" | "accessLevel">>) { const current = await this.read(id); if (!current) return undefined; const user = { ...current, ...input }; if (input.name) await this.auth.updateUser(id, { displayName: input.name }); await this.auth.setCustomUserClaims(id, claims(user)); await this.db.collection("usuarios").doc(id).set({ ...user, rol: "admin" }, { merge: true }); return user; }
  async setActive(id: string, active: boolean) { const current = await this.read(id); if (!current) return undefined; await this.auth.updateUser(id, { disabled: !active }); const user = { ...current, active }; await this.db.collection("usuarios").doc(id).set({ active }, { merge: true }); return user; }
  private async read(id: string) { const doc = await this.db.collection("usuarios").doc(id).get(); return doc.exists ? toUser(id, doc.data()!) : undefined; }
}
function claims(user: AdminUser) { return { role: "admin", areas: user.areas, accessLevel: user.accessLevel, active: user.active }; }
function toUser(id: string, value: FirebaseFirestore.DocumentData): AdminUser { return { id, email: typeof value.email === "string" ? value.email : "", name: typeof value.name === "string" ? value.name : typeof value.nombre === "string" ? value.nombre : "", areas: Array.isArray(value.areas) ? value.areas.filter((area): area is string => typeof area === "string") : [], accessLevel: value.accessLevel === "coordinator" ? "coordinator" : "operator", active: value.active !== false }; }
