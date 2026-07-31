# MCP Reportes

Fachada MCP de solo lectura sobre el microservicio RAG (`rag-service/`).
La invoca `codex exec` para el agente `pattern` (ver
`backend/src/business/agents/cli.gateway.ts` y
`services/mcp-reportes/mcp.json`).

```bash
cd services/mcp-reportes
python3 -m pip install -r requirements.txt
```

Requiere que `rag-service` esté corriendo en `RAG_SERVICE_URL`
(por defecto `http://localhost:8001`); ver `rag-service/README.md`.
