import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { AgentGateway } from "../orchestrator/supervisor";
import type { AgentTraceObserver, Report, Ticket } from "../types";

const contracts = resolve(process.cwd(), "../agents/contracts");
const prompts = resolve(process.cwd(), "../agents/prompts");

type McpServer = { command: string; args: string[] };
type McpConfig = { mcpServers: Record<string, McpServer> };

export type CodexInvocationInput = {
  agent: string;
  prompt: string;
  schemaPath: string;
  outputPath?: string;
  payload: unknown;
  cwd?: string;
  mcpConfig?: McpConfig;
};

const defaultMcpConfig = (cwd: string): McpConfig => ({
  mcpServers: {
    reportes: {
      command: "python3",
      args: [resolve(cwd, "../services/mcp-reportes/server.py")],
    },
  },
});

export function buildCodexInvocation({ agent, prompt, schemaPath, outputPath, payload, cwd = process.cwd(), mcpConfig }: CodexInvocationInput): { args: string[] } {
  const fullPrompt = `${prompt}\n\nReporte de entrada (JSON):\n${JSON.stringify(payload)}\n\nResponde exclusivamente con JSON que cumpla el esquema indicado.`;
  const args = ["exec", "--ephemeral", "--sandbox", "read-only", "--json", "--model", process.env.CODEX_MODEL ?? "gpt-5.6-luna", "--output-schema", schemaPath];
  if (outputPath) args.push("--output-last-message", outputPath);
  if (agent === "pattern") {
    const reportes = (mcpConfig ?? defaultMcpConfig(cwd)).mcpServers.reportes;
    args.push(
      "--config", `mcp_servers.reportes.command=${JSON.stringify(reportes.command)}`,
      "--config", `mcp_servers.reportes.args=${JSON.stringify(reportes.args)}`,
      "--config", "mcp_servers.reportes.required=true",
      "--config", 'mcp_servers.reportes.default_tools_approval_mode="auto"',
    );
  }
  args.push(fullPrompt);
  return { args };
}

async function loadMcpConfig(cwd: string): Promise<McpConfig> {
  const configPath = resolve(cwd, process.env.MCP_REPORTES_CONFIG ?? "../services/mcp-reportes/mcp.json");
  const raw: unknown = JSON.parse(await readFile(configPath, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("MCP configuration must be an object");
  const servers = (raw as Record<string, unknown>).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) throw new Error("MCP configuration requires mcpServers");
  const reportes = (servers as Record<string, unknown>).reportes;
  if (!reportes || typeof reportes !== "object" || Array.isArray(reportes)) throw new Error("MCP configuration requires mcpServers.reportes");
  const command = (reportes as Record<string, unknown>).command;
  const args = (reportes as Record<string, unknown>).args;
  if (typeof command !== "string" || !Array.isArray(args) || !args.every((arg): arg is string => typeof arg === "string")) throw new Error("MCP reportes configuration is invalid");
  return { mcpServers: { reportes: { command, args: args.map((arg) => resolve(cwd, arg)) } } };
}

async function invoke<T>(agent: string, payload: unknown, trace?: AgentTraceObserver): Promise<T> {
  const [prompt, schema] = await Promise.all([readFile(join(prompts, `${agent}.md`), "utf8"), readFile(join(contracts, `${agent}.schema.json`), "utf8")]);
  const cwd = process.cwd();
  const mcpConfig = agent === "pattern" ? await loadMcpConfig(cwd) : undefined;
  const tempDir = await mkdtemp(join(tmpdir(), "triage-codex-"));
  const schemaPath = join(tempDir, `${agent}.schema.json`);
  const outputPath = join(tempDir, `${agent}.final.txt`);
  await writeFile(schemaPath, schema, "utf8");
  const { args } = buildCodexInvocation({ agent, prompt, schemaPath, outputPath, payload, cwd, mcpConfig });
  await emit(trace, "invocation.started", { agent, prompt, payload, schema, args, cwd, ...(mcpConfig ? { mcp_config: mcpConfig } : {}) });
  try {
    return await new Promise<T>((resolvePromise, reject) => {
      const child = spawn(process.env.CODEX_BIN ?? "codex", args, { stdio: ["ignore", "pipe", "pipe"] }); let out = ""; let err = ""; let jsonlBuffer = ""; let timedOut = false;
      const pending: Promise<void>[] = [];
      const traceEmit = (type: "process.stdout" | "process.stderr" | "codex.event" | "agent.message" | "mcp.tool_call", data: unknown) => { pending.push(emit(trace, type, data)); };
      const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 60_000);
      child.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString("utf8"); out += chunk; traceEmit("process.stdout", chunk); jsonlBuffer += chunk;
        let newline = jsonlBuffer.indexOf("\n");
        while (newline >= 0) { const raw = jsonlBuffer.slice(0, newline); jsonlBuffer = jsonlBuffer.slice(newline + 1); if (raw) traceCodexEvent(raw, traceEmit); newline = jsonlBuffer.indexOf("\n"); }
      });
      child.stderr.on("data", (data: Buffer) => { const chunk = data.toString("utf8"); err += chunk; traceEmit("process.stderr", chunk); });
      child.on("error", (cause) => { clearTimeout(timer); void emit(trace, "agent.failed", { error: cause.message }); reject(cause); });
      child.on("close", async (code, signal) => {
        clearTimeout(timer); if (jsonlBuffer) traceCodexEvent(jsonlBuffer, traceEmit);
        let finalOutput = ""; try { finalOutput = await readFile(outputPath, "utf8"); } catch { /* Codex may fail before writing it. */ }
        await Promise.all(pending); await emit(trace, "process.exited", { code, signal, timed_out: timedOut });
        if (timedOut) { const failure = `${agent} timeout`; await emit(trace, "agent.failed", { error: failure, stderr: err, stdout: out }); return reject(new Error(failure)); }
        if (code !== 0) { const failure = `${agent} failed: ${err}`; await emit(trace, "agent.failed", { error: failure, stderr: err, stdout: out }); return reject(new Error(failure)); }
        try { const parsed = JSON.parse(finalOutput); await emit(trace, "agent.final_response", { raw: finalOutput, parsed }); resolvePromise(parsed as T); }
        catch { const failure = `${agent} returned invalid JSON`; await emit(trace, "agent.failed", { error: failure, final_output: finalOutput, stdout: out, stderr: err }); reject(new Error(failure)); }
      });
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
async function emit(trace: AgentTraceObserver | undefined, type: Parameters<AgentTraceObserver["emit"]>[0]["type"], data: unknown) {
  try { await trace?.emit({ type, data }); } catch { /* Trace persistence cannot change agent outcome. */ }
}
function traceCodexEvent(raw: string, emitEvent: (type: "codex.event" | "agent.message" | "mcp.tool_call", data: unknown) => void) {
  let event: unknown;
  try { event = JSON.parse(raw); } catch { emitEvent("codex.event", raw); return; }
  emitEvent("codex.event", { raw, event });
  const item = event && typeof event === "object" ? (event as { item?: { type?: unknown; text?: unknown } }).item : undefined;
  if (!item || typeof item.type !== "string") return;
  if (item.type === "agent_message") emitEvent("agent.message", { raw, item });
  if (item.type.includes("mcp")) emitEvent("mcp.tool_call", { raw, item });
}
export const cliAgents: AgentGateway = {
  classifier: (report, trace) => invoke("classifier", report, trace), pattern: (report, trace) => invoke("pattern", report, trace), acuse: (report, trace) => invoke("acuse", report, trace),
  evidence: (report, trace) => invoke("evidence", report, trace), dedup: (report, candidates, trace) => invoke("dedup", { ...report, candidatos_recientes: candidates }, trace),
  escalation: (ticket: Ticket, school: string, trace) => invoke("escalation", { ...ticket, cerca_escuela: true, escuela_nombre: school }, trace),
};
