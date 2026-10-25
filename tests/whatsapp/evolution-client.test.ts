import { describe, expect, it, vi } from "vitest";
import { createEvolutionChannel } from "@/lib/whatsapp/evolution-client";

const config = { baseUrl: "http://bumera-evolution:8080", apiKey: "k".repeat(32) };

function fakeFetch(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe("Evolution channel", () => {
  it("posts the text to the instance with the API key and returns WhatsApp's message id", async () => {
    const fetch = fakeFetch(Response.json({ key: { id: "WA123", remoteJid: "5511987654321@s.whatsapp.net" } }, { status: 201 }));
    const channel = createEvolutionChannel({ ...config, fetch });

    const result = await channel.sendText({ instance: "clínica a", phoneE164: "+5511987654321", text: "Olá!" });

    expect(result).toEqual({ ok: true, providerMessageId: "WA123" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://bumera-evolution:8080/message/sendText/cl%C3%ADnica%20a");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apikey).toBe(config.apiKey);
    expect(JSON.parse(init.body as string)).toEqual({ number: "5511987654321", text: "Olá!" });
  });

  it("accepts a success without a message id", async () => {
    const channel = createEvolutionChannel({ ...config, fetch: fakeFetch(Response.json({}, { status: 200 })) });
    expect(await channel.sendText({ instance: "a", phoneE164: "+5511987654321", text: "x" })).toEqual({ ok: true, providerMessageId: null });
  });

  it("reports an HTTP error by its status code only", async () => {
    const channel = createEvolutionChannel({ ...config, fetch: fakeFetch(new Response("number not on whatsapp", { status: 400 })) });
    expect(await channel.sendText({ instance: "a", phoneE164: "+5511987654321", text: "x" })).toEqual({ ok: false, error: "evolution_http_400" });
  });

  it("reports an unreachable Evolution without throwing", async () => {
    const channel = createEvolutionChannel({ ...config, fetch: fakeFetch(new TypeError("fetch failed")) });
    expect(await channel.sendText({ instance: "a", phoneE164: "+5511987654321", text: "x" })).toEqual({ ok: false, error: "evolution_unreachable" });
  });
});
