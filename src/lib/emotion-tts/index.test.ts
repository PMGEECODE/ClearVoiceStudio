import assert from "node:assert/strict";
import test from "node:test";
import { planExpressiveSpeech, splitSentences, synthesizeExpressive } from "./index.ts";
import { buildWavFromPcm, parseWav } from "../wav.ts";

test("splits ordinary prose into stable synthesis sentences", () => {
  assert.deepEqual(splitSentences("Hello world. How are you? Great!"), [
    "Hello world.",
    "How are you?",
    "Great!",
  ]);
});

test("emotion planning uses restrained, distinct delivery", () => {
  const plans = planExpressiveSpeech(
    "I am so happy today! I miss you terribly. Stop this right now.",
    1
  );
  assert.equal(plans[0].emotion, "happy");
  assert.equal(plans[1].emotion, "sad");
  assert.equal(plans[2].emotion, "angry");
  assert.ok(plans[1].speed < plans[0].speed);
  assert.ok(plans[1].pauseSeconds > plans[0].pauseSeconds);
});

test("very brief sentences inherit the preceding delivery", () => {
  const plans = planExpressiveSpeech("I am afraid of this. Please.", 1);
  assert.equal(plans[1].emotion, "fearful");
});

test("expressive synthesis stitches audible sentence audio with pauses", async () => {
  const output = await synthesizeExpressive({
    text: "I am happy today. I am sad today.",
    intensity: 1,
    synthesizeSentence: async (_text, speed) => {
      const frames = Math.round(2_400 / speed);
      const pcm = Buffer.alloc(frames * 2, 1);
      return buildWavFromPcm(pcm, {
        audioFormat: 1,
        numChannels: 1,
        sampleRate: 24_000,
        bitsPerSample: 16,
      });
    },
  });
  const parsed = parseWav(output);
  assert.equal(parsed.sampleRate, 24_000);
  assert.ok(parsed.data.length > 9_600, "contains both sentence audio and an emotional pause");
});

test("batches adjacent neutral sentences but keeps an emotion change separate", async () => {
  const calls: string[] = [];
  await synthesizeExpressive({
    text: "The office was quiet. The coffee was ready. I am so happy today!",
    intensity: 1,
    synthesizeSentence: async (text) => {
      calls.push(text);
      return buildWavFromPcm(Buffer.alloc(4_800), {
        audioFormat: 1,
        numChannels: 1,
        sampleRate: 24_000,
        bitsPerSample: 16,
      });
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /office was quiet\. The coffee was ready\./);
  assert.match(calls[1], /happy today/);
});
