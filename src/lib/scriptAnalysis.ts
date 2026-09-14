export type ScriptSpeaker = {
  key: string;
  label: string;
  gender?: "male" | "female";
  turns: number;
};

export type ScriptAnalysis = {
  mode: "single" | "dialogue";
  turns: number;
  speakers: ScriptSpeaker[];
  reason: string;
};

export type SynthesisProgressState = {
  percent: number;
  label: string;
  detail: string;
  turns: number;
  elapsedSeconds: number;
} | null;

export const QUICK_PRESETS = [
  {
    title: "School Announcement",
    text: "Welcome to our school management system. Your student registration and semester courses have been verified.",
  },
  {
    title: "Payment Receipt",
    text: "Thank you for your transaction. Your payment of forty-five hundred shillings has been received successfully via Payhero.",
  },
  {
    title: "Customer Welcome",
    text: "Hello! Welcome to Livecode Technologies ICT training and software solutions. How can we assist you today?",
  },
  {
    title: "Audiobook Sample",
    text: "The morning light broke through the highland mist, illuminating the tranquil valley below in a warm golden hue.",
  },
  {
    title: "Two-Voice Dialogue",
    text: 'Speaker 1, male: "Hey, are you ready to leave?" Speaker 2, female: "Almost. Give me just a minute." Speaker 1, male: "We\'re already running late." Speaker 2, female: "I know, I know. I\'m coming." Speaker 1, male: "Alright, I\'ll wait for you outside."',
  },
  {
    title: "Script Cast Sample",
    text: "**Speaker 1:** You've got the tech, and you've got the management. Who else would we sign with?\n**Speaker 2:** The 720,000 actually hit our account.\n**Speaker 1:** It's not our money yet. Secure the materials, wages, and production first. We cannot afford a single mistake. Understood?\n**Speaker 2:** Understood. Let's get to work.\n**Speaker 1:** Ethan, you handle the materials and production schedule.\n**Ethan:** Got it.\n**Speaker 1:** Tell Calebays to call back all the former workers. Give them a raise.\n**Ethan:** Okay. I'll draft the schedule right now.\n**Speaker 3:** They paid off all the back pay they owed us?\n**Speaker 1:** Yes. The factory did you guys dirty before, but now we have a new order. If you're willing to come back, we start fresh.\n**Speaker 3:** Seriously?\n**Speaker 1:** Seriously. Everyone, return to your original teams. The teams stay together.",
  },
];

export function normalizeSpeakerKey(label: string): string {
  return label.replace(/\*+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeSpeakerLabel(label: string): string {
  return label.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeGender(value?: string): "male" | "female" | undefined {
  const normalized = value?.toLowerCase();
  return normalized === "male" || normalized === "female" ? normalized : undefined;
}

export function inferGenderFromSpeaker(label: string): "male" | "female" | undefined {
  const normalized = normalizeSpeakerKey(label);
  const speakerMatch = normalized.match(/^speaker\s*(\d+)$/);
  if (speakerMatch) {
    const speakerNumber = Number(speakerMatch[1]);
    if (Number.isFinite(speakerNumber)) {
      return speakerNumber % 2 === 0 ? "female" : "male";
    }
  }

  const maleNames = ["ethan", "caleb", "james", "john", "david", "michael", "daniel", "peter"];
  const femaleNames = ["amy", "mary", "sarah", "grace", "jane", "linda", "cori", "kathleen"];

  if (maleNames.includes(normalized)) return "male";
  if (femaleNames.includes(normalized)) return "female";
  return undefined;
}

export function analyzeScriptText(script: string): ScriptAnalysis {
  const input = script.replace(/\\\s*/g, " ").replace(/\r\n?/g, "\n");
  const labels: Array<{ name: string; gender?: "male" | "female" }> = [];

  const boldLineLabelPattern =
    /(^|\n)[ \t]*(?:[-*]\s*)?\*\*([A-Za-z][A-Za-z0-9_'’.-]*(?:\s+[A-Za-z0-9_'’.-]+){0,3}|Speaker\s*\d+|Narrator|Male|Female)(?:\s*,\s*(male|female))?[ \t]*:\*\*[ \t]*/gi;
  const plainLineLabelPattern =
    /(^|\n)[ \t]*(?:[-*]\s*)?(Speaker\s*\d+|Narrator|Male|Female)(?:\s*,\s*(male|female))?[ \t]*:[ \t]*/gi;

  for (const match of input.matchAll(boldLineLabelPattern)) {
    labels.push({
      name: normalizeSpeakerLabel(match[2]),
      gender: normalizeGender(match[3]),
    });
  }

  for (const match of input.matchAll(plainLineLabelPattern)) {
    labels.push({
      name: normalizeSpeakerLabel(match[2]),
      gender: normalizeGender(match[3]),
    });
  }

  if (labels.length < 2) {
    const inlineLabelPattern =
      /(?:^|\n|\s)(Speaker\s*\d+|Narrator|Male|Female)(?:\s*,\s*(male|female))?\s*:\s*/gi;
    for (const match of input.matchAll(inlineLabelPattern)) {
      labels.push({
        name: normalizeSpeakerLabel(match[1]),
        gender: normalizeGender(match[2]),
      });
    }
  }

  const speakerMap = new Map<string, ScriptSpeaker>();
  for (const label of labels) {
    const key = normalizeSpeakerKey(label.name);
    const existing = speakerMap.get(key);
    if (existing) {
      existing.turns += 1;
      existing.gender = existing.gender || label.gender || inferGenderFromSpeaker(label.name);
    } else {
      speakerMap.set(key, {
        key,
        label: label.name,
        gender: label.gender || inferGenderFromSpeaker(label.name),
        turns: 1,
      });
    }
  }

  const speakers = Array.from(speakerMap.values());
  const hasDialogue = labels.length >= 2 && speakers.length >= 2;

  return {
    mode: hasDialogue ? "dialogue" : "single",
    turns: hasDialogue ? labels.length : 1,
    speakers: hasDialogue ? speakers : [],
    reason: hasDialogue
      ? `Detected ${speakers.length} speakers across ${labels.length} turns.`
      : "No explicit speaker labels detected. This will use the selected voice all the way through.",
  };
}
