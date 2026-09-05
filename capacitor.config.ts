import type { CapacitorConfig } from "@capacitor/cli";

/*
 * LET OP - appId ligt vast zodra de eerste APK bij iemand op de telefoon staat.
 * Android ziet een gewijzigde appId als een compleet andere app: opnieuw
 * installeren, ranglijst kwijt. De zichtbare naam (appName) mag wel veranderen.
 *
 * webDir is www/ en die map wordt door scripts/bouw.js gevuld - nooit met de
 * hand aanpassen, je wijzigingen zijn bij de volgende build weg.
 */
const config: CapacitorConfig = {
  appId: "nl.paulirikx.freecell",
  appName: "FreeCell",
  webDir: "www",
  android: {
    backgroundColor: "#0d6438",
  },
};

export default config;
