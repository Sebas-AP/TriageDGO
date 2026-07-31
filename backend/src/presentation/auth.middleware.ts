import { getAuth } from "firebase-admin/auth";
import { getApps } from "firebase-admin/app";
import type { Principal } from "../business/types";
import { firestore } from "../data/firestore/firebase";

export async function firebasePrincipal(headers: { authorization?: string }): Promise<Principal> {
  const token = headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("UNAUTHENTICATED");
  firestore(); // initializes the Admin app once
  const decoded = await getAuth(getApps()[0]).verifyIdToken(token);
  const role = decoded.role === "admin" ? "admin" : "invitado";
  if (role === "invitado" && decoded.firebase?.sign_in_provider !== "anonymous" && decoded.role !== "invitado") throw new Error("FORBIDDEN");
  return { uid: decoded.uid, role, areas: Array.isArray(decoded.areas) ? decoded.areas.filter((x): x is string => typeof x === "string") : [] };
}
