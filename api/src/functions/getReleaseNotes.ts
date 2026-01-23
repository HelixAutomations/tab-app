import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import fs from "fs";
import path from "path";

function findChangelogPath(): string | null {
  const candidates = [
    // Typical local TeamsFx: CWD is "api".
    path.resolve(process.cwd(), "..", "logs", "changelog.md"),
    // Some runtimes may set CWD to repo root.
    path.resolve(process.cwd(), "logs", "changelog.md"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }

  return null;
}

export async function getReleaseNotesHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log("getReleaseNotes function triggered.");

  if (req.method !== "GET") {
    return { status: 405, body: "Method Not Allowed. Please use GET." };
  }

  try {
    const changelogPath = findChangelogPath();
    if (!changelogPath) {
      return { status: 404, body: "Changelog not found" };
    }

    const text = fs.readFileSync(changelogPath, "utf8");
    return {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
      body: text,
    };
  } catch (error) {
    context.log(`Error loading changelog: ${String(error)}`);
    return { status: 500, body: "Failed to load release notes" };
  }
}

app.http("getReleaseNotes", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "release-notes",
  handler: getReleaseNotesHandler,
});

export default app;
