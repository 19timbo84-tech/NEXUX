import { createHash, randomBytes } from "node:crypto";
import type { ActionRequest } from "./contracts.js";

export interface ApprovalBinding {
  actorId: string;
  requestId: string;
  capabilityId: string;
  action: string;
  target: string;
  expiresAt: number;
}

export interface ApprovalStore {
  put(tokenHash: string, binding: ApprovalBinding): Promise<void>;
  /** Must atomically return-and-delete a token record to prevent replay. */
  consume(tokenHash: string): Promise<ApprovalBinding | undefined>;
}

/**
 * Development-only store. It is process-local and is NOT safe for multiple
 * replicas or production restarts. Production must use a durable store with
 * an atomic consume operation (e.g. a transaction or compare-and-delete).
 */
export class InMemoryApprovalStore implements ApprovalStore {
  private readonly records = new Map<string, ApprovalBinding>();

  async put(tokenHash: string, binding: ApprovalBinding): Promise<void> {
    this.records.set(tokenHash, binding);
  }

  async consume(tokenHash: string): Promise<ApprovalBinding | undefined> {
    const record = this.records.get(tokenHash);
    if (!record) return undefined;
    this.records.delete(tokenHash);
    return record;
  }
}

export class OneTimeApprovalService {
  constructor(
    private readonly store: ApprovalStore,
    private readonly now: () => number = Date.now
  ) {}

  async issue(input: Omit<ApprovalBinding, "expiresAt">, ttlMs = 120_000): Promise<string> {
    if (!input.actorId.trim() || !input.requestId.trim() ||
        !input.capabilityId.trim() || !input.action.trim() || !input.target.trim()) {
      throw new Error("Approval must be bound to a complete actor/request/action/target.");
    }
    if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 300_000) {
      throw new Error("Approval TTL must be between 1 second and 5 minutes.");
    }
    const token = randomBytes(32).toString("base64url");
    await this.store.put(this.hash(token), { ...input, expiresAt: this.now() + ttlMs });
    return token;
  }

  /** Pass this method to FailClosedPolicy.validateApprovalToken. */
  validate = async (token: string, request: ActionRequest): Promise<boolean> => {
    if (!token || token.length > 256) return false;
    const record = await this.store.consume(this.hash(token));
    if (!record || record.expiresAt <= this.now()) return false;
    return record.actorId === request.actorId &&
      record.requestId === request.requestId &&
      record.capabilityId === request.capabilityId &&
      record.action === request.action &&
      record.target === request.target;
  };

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
