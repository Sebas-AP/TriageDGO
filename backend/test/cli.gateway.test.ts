import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

import { buildCodexInvocation } from "../src/business/agents/cli.gateway";

describe("buildCodexInvocation", () => {
  it("usa el modelo Luna y entrega la ruta del contrato completo a Codex", () => {
    const invocation = buildCodexInvocation({
      agent: "classifier",
      prompt: "Clasifica el reporte.",
      schemaPath: "/tmp/classifier.schema.json",
      payload: { texto: "Hay un bache" },
      cwd: "/tmp/triage-backend",
    });

    expect(invocation.args).toContain("exec");
    expect(invocation.args).toContain("--json");
    expect(invocation.args).toContain("gpt-5.6-luna");
    expect(invocation.args[invocation.args.indexOf("--output-schema") + 1]).toBe("/tmp/classifier.schema.json");
    expect(invocation.args.at(-1)).toContain('"texto":"Hay un bache"');
  });

  it("solicita que Codex guarde el último mensaje estructurado fuera del stream JSONL", () => {
    const invocation = buildCodexInvocation({
      agent: "classifier", prompt: "Clasifica.", schemaPath: "/tmp/schema.json", outputPath: "/tmp/final.json", payload: {},
    });
    expect(invocation.args.slice(invocation.args.indexOf("--output-last-message"))).toContain("/tmp/final.json");
  });

  it("usa configuración MCP TOML absoluta para pattern", () => {
    const invocation = buildCodexInvocation({
      agent: "pattern",
      prompt: "Busca patrones.",
      schemaPath: "/tmp/pattern.schema.json",
      payload: { texto: "Hay una fuga" },
      cwd: "/tmp/triage-backend",
    });

    expect(invocation.args).toContain('mcp_servers.reportes.command="python3"');
    expect(invocation.args).toContain(`mcp_servers.reportes.args=${JSON.stringify([resolve("/tmp/triage-backend", "../services/mcp-reportes/server.py")])}`);
    expect(invocation.args).toContain("mcp_servers.reportes.required=true");
  });

  it("no agrega configuración MCP a agentes que no usan tools", () => {
    const invocation = buildCodexInvocation({
      agent: "acuse",
      prompt: "Redacta acuse.",
      schemaPath: "/tmp/acuse.schema.json",
      payload: { texto: "Hola" },
      cwd: "/tmp/triage-backend",
    });

    expect(invocation.args.join(" ")).not.toContain("mcp_servers.reportes");
  });
});
