import { afterEach, describe, expect, it, vi } from "vitest";
import { getConnectionState } from "@/lib/evolution";

const URL_BASE = "http://evolution.test:8080";

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("getConnectionState", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reports unconfigured when the app has no Evolution address or key", async () => {
    vi.stubEnv("EVOLUTION_API_URL", "");
    vi.stubEnv("EVOLUTION_API_KEY", "");
    expect(await getConnectionState("clinica-a")).toBe("unconfigured");
  });

  describe("with Evolution configured", () => {
    const configure = () => {
      vi.stubEnv("EVOLUTION_API_URL", URL_BASE);
      vi.stubEnv("EVOLUTION_API_KEY", "k".repeat(40));
    };

    it.each([
      ["open", "open"],
      ["connecting", "connecting"],
      ["close", "closed"],
      ["refused", "unknown"],
    ])("maps the state %s to %s", async (state, expected) => {
      configure();
      const fetchMock = stubFetch(async () => Response.json({ instance: { instanceName: "clinica-a", state } }));

      expect(await getConnectionState("clinica-a")).toBe(expected);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${URL_BASE}/instance/connectionState/clinica-a`);
      expect((init.headers as Record<string, string>).apikey).toBe("k".repeat(40));
    });

    it("answers unknown when the instance does not exist, the call fails or the answer is odd", async () => {
      configure();
      stubFetch(async () => new Response("not found", { status: 404 }));
      expect(await getConnectionState("clinica-a")).toBe("unknown");
      stubFetch(async () => {
        throw new Error("connect ECONNREFUSED");
      });
      expect(await getConnectionState("clinica-a")).toBe("unknown");
      stubFetch(async () => Response.json({ unexpected: true }));
      expect(await getConnectionState("clinica-a")).toBe("unknown");
    });

    it("encodes the instance name in the URL", async () => {
      configure();
      const fetchMock = stubFetch(async () => Response.json({ instance: { state: "open" } }));
      await getConnectionState("a/b c");
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${URL_BASE}/instance/connectionState/a%2Fb%20c`);
    });
  });
});
