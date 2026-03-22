import { buildBriefingContent } from "../ipc/proxy-summary.js";

export async function getBriefing(args: {
  max_trials_per_session?: number;
  include_resolved?: boolean;
}): Promise<string> {
  return await buildBriefingContent({
    maxTrialsPerSession: args.max_trials_per_session ?? 10,
    includeResolved: args.include_resolved ?? false,
  });
}
