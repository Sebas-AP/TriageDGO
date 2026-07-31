import type { Firestore } from "firebase-admin/firestore";

export interface Predial { id: string; claveCatastral: string; ubicacion: string; alCorriente: boolean; actualizadoEn: string; }
export interface PredialRepository { buscarPorClave(claveCatastral: string): Promise<Predial | null>; }

export function createPredialRepository(db: Firestore): PredialRepository {
  const collection = db.collection("predial");
  return { async buscarPorClave(claveCatastral) { const result = await collection.where("claveCatastral", "==", claveCatastral).limit(1).get(); const found = result.docs[0]; return found ? { id: found.id, ...(found.data() as Omit<Predial, "id">) } : null; } };
}
