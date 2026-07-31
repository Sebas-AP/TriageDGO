import { z } from "zod";

export const CoordenadasSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);

export const NuevoReporteSchema = z.object({
  ciudadanoId: z.string().min(1),
  canal: z.enum(["formulario", "whatsapp", "llamada"]),
  texto: z.string().min(1),
  coordenadas: CoordenadasSchema,
  colonia: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
});

export type NuevoReporteInput = z.infer<typeof NuevoReporteSchema>;
