import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

export type RolUsuario = "ciudadano" | "admin";
export interface Usuario { id: string; nombre: string; rol: RolUsuario; telefono?: string; accessLevel?: "operator" | "coordinator"; areas?: string[]; active?: boolean; }
export interface UsersRepository { guardar(usuario: Usuario): Promise<void>; leer(id: string): Promise<Usuario | null>; asignarRol(id: string, rol: RolUsuario): Promise<void>; }

export function createUsersRepository(db: Firestore, auth: Auth): UsersRepository {
  const collection = db.collection("usuarios");
  return {
    async guardar(usuario) { await collection.doc(usuario.id).set({ nombre: usuario.nombre, rol: usuario.rol, ...(usuario.telefono ? { telefono: usuario.telefono } : {}) }, { merge: true }); },
    async leer(id) { const snap = await collection.doc(id).get(); return snap.exists ? { id: snap.id, ...(snap.data() as Omit<Usuario, "id">) } : null; },
    async asignarRol(id, rol) { await auth.setCustomUserClaims(id, { rol, role: rol === "admin" ? "admin" : "invitado" }); await collection.doc(id).set({ rol }, { merge: true }); },
  };
}
