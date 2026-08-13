const GUIDE_CHAPTER = "/more/guide/connecting-an-ai";

const CHAPTER_DESTINATIONS: Readonly<Record<string, string>> = {
  "what-it-is": `${GUIDE_CHAPTER}/what-it-opens-up`,
  "the-rules": `${GUIDE_CHAPTER}/staying-in-control`,
  "what-it-can-do": `${GUIDE_CHAPTER}/what-it-opens-up`,
  macrocycles: `${GUIDE_CHAPTER}/planning-and-building`,
  mesocycles: `${GUIDE_CHAPTER}/planning-and-building`,
  analysis: `${GUIDE_CHAPTER}/analysis-and-insight`,
  coaching: `${GUIDE_CHAPTER}/coaching-in-context`,
  "getting-good-answers": `${GUIDE_CHAPTER}/working-with-it`,
  "reading-answers": `${GUIDE_CHAPTER}/reading-the-answer`,
  "notes-and-preferences": `${GUIDE_CHAPTER}/the-context-it-carries`,
  "when-it-gets-it-wrong": `${GUIDE_CHAPTER}/reading-the-answer`,
};

/** Setup moved to the connector page; every other topic maps to its new section. */
export function legacyAiGuideDestination(chapter: string): string {
  if (chapter === "setup") return "/more/connector";
  return CHAPTER_DESTINATIONS[chapter] ?? GUIDE_CHAPTER;
}
