# Credenciales pendientes — Rol 2

El desarrollo local usa los emuladores Firebase y los dobles/fallbacks incluidos. Al recibir credenciales:

- Firebase: completar `FIREBASE_*`, iniciar emuladores para pruebas y mantener las reglas actuales.
- Google Maps: completar `GOOGLE_MAPS_API_KEY` y activar `createGoogleMapsClient`; conservar el catálogo como respaldo.
- Twilio: completar `TWILIO_*`, probar primero en WhatsApp Sandbox y validar firmas de webhook.
- Whisper: completar `WHISPER_API_KEY`; el cliente ya llama a `/v1/audio/transcriptions`.

Las claves nunca se aceptan como argumentos de herramientas MCP ni se registran en logs.
