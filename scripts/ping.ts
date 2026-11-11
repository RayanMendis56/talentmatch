import { config } from "dotenv";
config({ path: ".env.local" });
import { callJson } from "../src/lib/llm";

callJson<{ ok: boolean }>('Return only this JSON: {"ok": true}', 1)
  .then((result) => console.log("OK:", result))
  .catch((error: unknown) => {
    console.error("ERR:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
