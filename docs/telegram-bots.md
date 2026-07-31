# Alertas internas por Telegram

La rama `telegram` envía alertas internas después de que el Supervisor crea y
persiste el ticket final. Telegram no participa en la clasificación y una falla
del bot nunca revierte un reporte aceptado.

El acuse ciudadano usa `TELEGRAM_CITIZEN_BOT_TOKEN` y
`TELEGRAM_CITIZEN_CHAT_ID`. El ciudadano debe iniciar antes la conversación con
el bot (`/start`), ya que Telegram no permite que un bot inicie un chat privado.

## Enrutamiento

| Destino | Categorías predeterminadas |
|---|---|
| Baches / Obras Públicas | `bache` |
| Salud / Riesgo sanitario | `basura_acumulada`, `drenaje_tapado`, `fuga_agua` |

La lista de Salud se puede cambiar sin recompilar:

```env
TELEGRAM_SALUD_CATEGORIES=basura_acumulada,drenaje_tapado,fuga_agua
```

Los tickets en revisión manual no se notifican automáticamente para evitar
enrutarlos al área equivocada.

## Crear los bots

1. Abrir una conversación privada con `@BotFather`.
2. Ejecutar `/newbot`.
3. Crear un bot para Salud y otro para Baches.
4. Guardar cada token directamente en `.env`; nunca pegarlo en Git o chats.
5. Crear o elegir dos grupos internos de Telegram.
6. Agregar el bot correspondiente a cada grupo.
7. Conceder únicamente permiso para publicar mensajes.
8. Enviar un mensaje de prueba dentro de cada grupo para generar una actualización.

Un bot no puede iniciar conversaciones privadas con usuarios que nunca lo han
contactado. Para este caso se recomienda publicar en grupos internos donde el bot
ya fue agregado.

## Configuración

```env
TELEGRAM_SALUD_BOT_TOKEN=
TELEGRAM_SALUD_CHAT_ID=
TELEGRAM_BACHES_BOT_TOKEN=
TELEGRAM_BACHES_CHAT_ID=
TELEGRAM_CITIZEN_BOT_TOKEN=
TELEGRAM_CITIZEN_CHAT_ID=
TELEGRAM_SALUD_CATEGORIES=basura_acumulada,drenaje_tapado,fuga_agua
TELEGRAM_TIMEOUT_MS=5000
TELEGRAM_MAX_ATTEMPTS=3
ADMIN_APP_URL=http://localhost:5173
```

Los Chat IDs de grupos y supergrupos suelen ser números negativos. Para
obtenerlos, el responsable de credenciales puede consultar `getUpdates` después
de enviar un mensaje al grupo y copiar `message.chat.id`. El token debe tratarse
como una contraseña y no debe aparecer en capturas o documentación.

## Contenido de la alerta

- destino operativo;
- folio del ticket;
- prioridad y urgencia;
- categoría y área responsable;
- canal de ingreso;
- descripción resumida;
- enlace de coordenadas en Google Maps;
- enlace a la consola administrativa, cuando `ADMIN_APP_URL` está configurada.

Los mensajes se envían como texto plano, con vista previa de enlaces desactivada
y contenido protegido contra reenvío/guardado mediante `protect_content`.

## Resiliencia

- timeout configurable por solicitud;
- hasta tres intentos de forma predeterminada;
- respeto de `retry_after` cuando Telegram responde HTTP 429;
- reintentos exponenciales ante red o respuestas 5xx;
- errores sin tokens ni Chat IDs en logs;
- entrega posterior a la persistencia del ticket.

## Validación

Sin credenciales reales:

```powershell
cd backend
npm test -- telegram-notification.service.test.ts telegram-worker.integration.test.ts
```

Las pruebas verifican enrutamiento, formato, entrega, reintento, configuración
ausente y continuidad del worker cuando Telegram está fuera de servicio.
