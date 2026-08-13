import type { Release } from "./types";

/**
 * The App Guide release: the guide itself, its AI-facing retrieval surface,
 * contextual links throughout the app, and the day-view focus pass that
 * shipped alongside it. The first three entries are the modal highlights;
 * the full set remains available under More → What's New.
 */
export const RELEASE_1_1_0: Release = {
  version: "1.1.0",
  date: "2026-08-13",
  kind: "feature",
  headline: "The guide is here",
  entries: [
    {
      id: "user-guide",
      title: "The App Guide, wherever you need it",
      body: "More → Guide explains each screen and how the numbers are worked out. Helpful links open it where questions come up, and a connected Claude or ChatGPT can search and read it too.",
      area: "app",
      highlight: true,
      link: {
        label: "Open the guide",
        target: { kind: "app", href: "/more/guide" },
      },
    },
    {
      id: "ai-manual",
      title: "A complete guide to training with AI",
      body: "The Guide now shows how a connected Claude or ChatGPT can understand your full training history, analyze progress, build plans in the app, and turn coaching decisions into changes you control.",
      area: "connector",
      highlight: true,
      link: {
        label: "Explore the AI guide",
        target: {
          kind: "guide",
          section: "ug/connecting-an-ai#what-it-opens-up",
        },
      },
    },
    {
      id: "day-view-focus-pass",
      title: "A cleaner workout screen",
      body: "Tap an exercise's name to open the program's reasoning — the button that used to do it is gone, and its card is simpler for it. Notes read as one block, and the exercise menu is grouped into shorter lists.",
      area: "training",
      highlight: true,
      link: {
        label: "Open your workout",
        target: { kind: "app", href: "/workout" },
      },
    },
    {
      id: "guide-links-in-the-app",
      title: "Explanations beside the numbers",
      body: "Prescription details, volume checks, strength trends, feedback, and effort controls now link straight to the Guide section that explains the number or choice in front of you. The back link returns you to your place.",
      area: "app",
    },
    {
      id: "asks-before-discarding",
      title: "A choice before leaving unsaved work",
      body: "When you try to leave a new macrocycle, custom exercise, feedback form, or another page with unsaved work, the app asks whether to stay or leave. Stay keeps your work in place; leave continues to your destination.",
      area: "app",
    },
    {
      id: "tap-a-term-to-define-it",
      title: "Definitions where terms appear",
      body: "Terms with a dotted underline open their definitions in place. New definitions cover the strength anchor, a block's phase, an exercise's effort target, backed off, effective load, and adherence.",
      area: "app",
    },
    {
      id: "connector-reads-the-guide",
      title: "Answers grounded in the App Guide",
      body: "A connected Claude or ChatGPT can search the App Guide before answering how WORKOUT works, then point you to the section it used so you can open it in the app.",
      area: "connector",
      link: {
        label: "Connector settings",
        target: { kind: "app", href: "/more/connector" },
      },
    },
    {
      id: "glossary-e1rm-rir-direction",
      title: "How reps in reserve affect estimated strength",
      body: "The estimated one-rep max card explains how reps in reserve affect the estimate: at the same weight and reps, finishing with reps to spare indicates more available strength.",
      area: "training",
    },
  ],
};
