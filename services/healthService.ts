/**
 * Backend Health Service
 * Checks the backend health endpoint and reports status + latency.
 */
import { API_BASE_URL } from "@/config/api";

export interface HealthResult {
  status: "connected" | "offline" | "error";
  latencyMs: number | null;
  message: string;
}

export async function checkBackendHealth(): Promise<HealthResult> {
  const healthUrl = API_BASE_URL.replace("/api", "") + "/health";
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(healthUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return {
        status: "connected",
        latencyMs,
        message: `Connected (${latencyMs}ms)`,
      };
    }

    return {
      status: "error",
      latencyMs,
      message: `Server responded with ${response.status}`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    if (err?.name === "AbortError") {
      return {
        status: "offline",
        latencyMs: null,
        message: "Request timed out",
      };
    }
    return {
      status: "offline",
      latencyMs: null,
      message: err?.message ?? "Network error",
    };
  }
}
