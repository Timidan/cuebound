import { expect, test } from "bun:test";
import { canonicalize, digest, parseBrief } from "./brief";
import { retrieveBrief, storeBrief, STORED } from "./dkg";
import type { SoundDesignBrief } from "./types";

const brief = (projectId = "demo", revision = 1): SoundDesignBrief => ({
  schemaVersion: 1,
  projectId,
  revision,
  predecessor: revision === 1 ? null : { revision: revision - 1, digest: "0".repeat(64) },
  direction: { name: "Soft arcade", texture: 'short, soft "pickup" tones; C:\\sfx\\ path', envelope: "fast attack\nshort tail\ttab", hierarchy: "sharp metallic textures reserved for damage — 漢字 é 😀" },
  cues: [{
    eventId: "pickup",
    role: "Coin pickup",
    descriptors: 'soft glassy "ding" \\ no reverb',
    avoid: "metal",
    processing: { gainDb: -3.5, trimStartMs: 0, maxDurationMs: 400, fadeOutMs: 60 },
    notes: ["keep it under the jump"],
    assets: [{ file: "audio/pickup_1.wav", sha256: "a".repeat(64) }],
  }],
  generator: { capability: "mirelo-sfx", modelId: "Mirelo-AI/sfx1.6/text-to-audio", termsRef: "https://agent.livepeer.org/terms" },
  assetBaseUrl: null,
  approval: { by: "developer", at: "2026-09-25T06:00:00.000Z", scope: "shared" },
});

test("canonical roundtrip, tamper detection and strict parse", () => {
  const b = brief();
  const c = canonicalize(b);
  expect(canonicalize(parseBrief(JSON.parse(c)))).toBe(c);
  const reordered = Object.fromEntries(Object.entries(b).reverse()) as unknown as SoundDesignBrief;
  expect(digest(reordered)).toBe(digest(b));

  const tampered = brief();
  tampered.cues[0].processing.gainDb = -3.49;
  expect(digest(tampered)).not.toBe(digest(b));

  expect(() => parseBrief({ ...b, cues: [{ ...b.cues[0], eventId: "Dash!" }] })).toThrow("eventId");
});

const live = await fetch(`${process.env.DKG_API_URL ?? "http://127.0.0.1:9200"}/api/status`).then((r) => r.ok, () => false);

test.skipIf(!live)("live DKG: store then retrieve with tricky characters", async () => {
  const b = brief("test-live", 2 + (Math.floor(Date.now() / 1000) % 900_000));
  const receipt = await storeBrief(b);
  expect(receipt.status).toBe(STORED);
  const got = await retrieveBrief(receipt.reference);
  expect(got.provenance.view).toBe("working-memory");
  expect(canonicalize(got.brief)).toBe(canonicalize(b));
  expect(digest(got.brief)).toBe(receipt.digest);
  await expect(retrieveBrief(receipt.reference.replace(/sha256=\w+/, `sha256=${"f".repeat(64)}`))).rejects.toThrow("digest_mismatch");
}, 60_000);
