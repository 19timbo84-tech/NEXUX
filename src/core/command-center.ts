import type {
  ActionRequest,
  AuthorizationPolicy,
  CapabilityManifest,
  CommandDecision,
  CommandPriority,
  CommandSignal,
  HeatMap,
  SystemCommand,
} from "./contracts.js";

const priorityRank: Record<CommandPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export class CommandCenter {
  private readonly signals: CommandSignal[] = [];

  observe(signal: CommandSignal): void {
    this.signals.push(signal);
  }

  collect(signals: CommandSignal[]): void {
    this.signals.push(...signals);
  }

  prioritize(signals: CommandSignal[] = this.signals): CommandSignal[] {
    return [...signals].sort((a, b) => {
      const diff = priorityRank[b.priority] - priorityRank[a.priority];
      if (diff !== 0) {
        return diff;
      }
      return b.score - a.score;
    });
  }

  buildHeatMap(signals: CommandSignal[] = this.signals): HeatMap {
    const byDomain = new Map<string, number>();
    const byLabel = new Map<string, number>();

    for (const signal of signals) {
      byDomain.set(signal.domain, (byDomain.get(signal.domain) ?? 0) + signal.score);
      byLabel.set(signal.label, (byLabel.get(signal.label) ?? 0) + signal.score);
    }

    const map: HeatMap = {};
    for (const [domain, score] of byDomain.entries()) {
      map[domain] = {
        label: domain,
        value: score,
        risk: this.labelRisk(score),
      };
    }

    for (const [label, score] of byLabel.entries()) {
      if (!map[label]) {
        map[label] = {
          label,
          value: score,
          risk: this.labelRisk(score),
        };
      }
    }

    return map;
  }

  decide(
    signals: CommandSignal[] = this.signals,
    request: ActionRequest,
    manifest: CapabilityManifest,
    authorizationPolicy: AuthorizationPolicy
  ): Promise<CommandDecision> {
    return (async () => {
      const ordered = this.prioritize(signals);
      const heatMap = this.buildHeatMap(ordered);
      const topPriority = ordered[0]?.priority ?? "LOW";

      const authResult = await authorizationPolicy.authorize(request, manifest);
      if (!authResult.allowed) {
        return {
          allowed: false,
          reason: authResult.reason,
          priority: topPriority,
          heatMap,
        };
      }

      const command: SystemCommand = {
        id: `cmd-${Date.now()}`,
        title: `Execute ${request.action}`,
        priority: topPriority,
        domain: ordered[0]?.domain ?? "command-center",
        action: request.action,
        params: {
          target: request.target,
          actorId: request.actorId,
          capabilityId: request.capabilityId,
        },
      };

      return {
        allowed: true,
        reason: "Decision accepted by the command center and policy engine.",
        priority: topPriority,
        heatMap,
        command,
      };
    })();
  }

  private labelRisk(score: number): CommandPriority {
    if (score >= 80) {
      return "CRITICAL";
    }
    if (score >= 60) {
      return "HIGH";
    }
    if (score >= 35) {
      return "MEDIUM";
    }
    return "LOW";
  }
}
