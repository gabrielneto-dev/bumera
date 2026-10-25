import { describe, expect, it } from "vitest";
import { parseEvolutionMessage, phoneCandidates } from "@/lib/inbound/evolution";

const base = (data: Record<string, unknown>, event = "messages.upsert") => ({ event, instance: "bumera-teste", data });

describe("parseEvolutionMessage", () => {
  it("extracts the sender phone, text and message id", () => {
    const parsed = parseEvolutionMessage(
      base({ key: { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "ABC" }, message: { conversation: "1" } }),
    );
    expect(parsed).toEqual({ instance: "bumera-teste", phoneE164: "+5517997822073", text: "1", messageId: "ABC" });
  });

  it("accepts the upper-case event name and extended text", () => {
    const parsed = parseEvolutionMessage(
      base(
        { key: { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "X" }, message: { extendedTextMessage: { text: "SAIR" } } },
        "MESSAGES_UPSERT",
      ),
    );
    expect(parsed?.text).toBe("SAIR");
  });

  it("uses the real number when WhatsApp hides it behind a @lid id", () => {
    const parsed = parseEvolutionMessage(
      base({
        key: { remoteJid: "1234567890@lid", remoteJidAlt: "5517997822073@s.whatsapp.net", fromMe: false, id: "L" },
        message: { conversation: "2" },
      }),
    );
    expect(parsed?.phoneE164).toBe("+5517997822073");
  });

  it.each([
    ["our own messages", { key: { remoteJid: "5517997822073@s.whatsapp.net", fromMe: true, id: "1" }, message: { conversation: "1" } }],
    ["group chats", { key: { remoteJid: "1203@g.us", fromMe: false, id: "1" }, message: { conversation: "1" } }],
    ["status broadcasts", { key: { remoteJid: "status@broadcast", fromMe: false, id: "1" }, message: { conversation: "1" } }],
    ["a hidden @lid without the number", { key: { remoteJid: "99@lid", fromMe: false, id: "1" }, message: { conversation: "1" } }],
    ["stickers", { key: { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "1" }, message: { stickerMessage: {} } }],
    ["messages with no content we know", { key: { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "1" }, message: { reactionMessage: { text: "👍" } } }],
    ["a non-Brazilian number", { key: { remoteJid: "14155550123@s.whatsapp.net", fromMe: false, id: "1" }, message: { conversation: "1" } }],
  ])("ignores %s", (_name, data) => {
    expect(parseEvolutionMessage(base(data))).toBeNull();
  });

  it("keeps audio and media without caption, with empty text and the kind of media", () => {
    const key = { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "M" };
    expect(parseEvolutionMessage(base({ key, message: { audioMessage: { seconds: 4 } } }))).toEqual({
      instance: "bumera-teste",
      phoneE164: "+5517997822073",
      text: "",
      messageId: "M",
      mediaKind: "audio",
    });
    expect(parseEvolutionMessage(base({ key, message: { documentMessage: {} } }))?.mediaKind).toBe("document");
  });

  it("reads the caption of an image as its text", () => {
    const key = { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "I" };
    expect(parseEvolutionMessage(base({ key, message: { imageMessage: { caption: "é esse dente" } } }))).toMatchObject({ text: "é esse dente", mediaKind: "image" });
  });

  it("ignores a payload that does not name the instance", () => {
    expect(parseEvolutionMessage({ event: "messages.upsert", data: { key: { remoteJid: "5517997822073@s.whatsapp.net", fromMe: false, id: "1" }, message: { conversation: "1" } } })).toBeNull();
  });

  it("ignores other events and malformed payloads", () => {
    expect(parseEvolutionMessage(base({}, "connection.update"))).toBeNull();
    expect(parseEvolutionMessage(null)).toBeNull();
    expect(parseEvolutionMessage("text")).toBeNull();
    expect(parseEvolutionMessage({ event: "messages.upsert" })).toBeNull();
  });
});

describe("phoneCandidates", () => {
  it("adds the ninth digit that older WhatsApp accounts omit", () => {
    expect(phoneCandidates("+551797822073")).toEqual(["+551797822073", "+5517997822073"]);
  });

  it("also tries the number without the ninth digit", () => {
    expect(phoneCandidates("+5517997822073")).toEqual(["+5517997822073", "+551797822073"]);
  });

  it("keeps landlines as they are", () => {
    expect(phoneCandidates("+551733221100")).toEqual(["+551733221100"]);
  });
});
