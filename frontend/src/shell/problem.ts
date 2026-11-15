/** Turn a raw failure message into what happened, whose fault it is, and what to do. */
export type ProblemKind = "offline" | "upstream" | "request" | "unknown";

export type Explained = {
  kind: ProblemKind;
  title: string;
  advice: string;
};

export function explainProblem(message: string, source = "NASA"): Explained {
  const text = message.toLowerCase();
  if (text.includes("did not answer") || text.includes("failed to fetch") || text.includes("networkerror")) {
    return {
      kind: "offline",
      title: "The SYNESTHESIA data service is not answering",
      advice: "The local backend may be stopped or still starting. Start it with pnpm dev, then try again. Nothing has been filled in.",
    };
  }
  if (
    text.includes("could not be reached") ||
    text.includes("could not download") ||
    text.includes("did not return") ||
    text.includes("timed out") ||
    text.includes("redirected") ||
    /\b50[234]\b/.test(text)
  ) {
    return {
      kind: "upstream",
      title: `${source} did not deliver this data`,
      advice: `${source} servers can be slow or briefly down. Try again in a moment. No sound is made from missing data.`,
    };
  }
  if (/\b4\d\d\b/.test(text) || text.includes("must be") || text.includes("before the start") || text.includes("unsupported") || text.includes("choose")) {
    return {
      kind: "request",
      title: "That request cannot be answered as asked",
      advice: "Check the place and dates, then try again.",
    };
  }
  return { kind: "unknown", title: "Something went wrong", advice: "Try again. If it keeps failing, the message below says what the service reported." };
}
