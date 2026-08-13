import { permanentRedirect } from "next/navigation";

/** The former AI Manual now lives in chapter 18 of the main Guide. */
export default function LegacyAiManualPage() {
  permanentRedirect("/more/guide/connecting-an-ai");
}
