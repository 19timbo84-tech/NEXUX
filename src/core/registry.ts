import type { CapabilityAdapter } from "./contracts.js";

export class CapabilityRegistry {
  private readonly adapters = new Map<string, CapabilityAdapter>();
  private readonly suspended = new Set<string>();

  register(adapter: CapabilityAdapter): void {
    const id = adapter.manifest.id.trim();
    if (!id) throw new Error("Capability id cannot be empty.");
    if (this.adapters.has(id)) throw new Error(`Capability already registered: ${id}`);
    if (!adapter.manifest.version.trim() ||
        !/^[a-f0-9]{64}$/i.test(adapter.manifest.sourceHash)) {
      throw new Error("Capability version and valid SHA-256 source digest are required.");
    }
    this.adapters.set(id, adapter);
  }

  get(id: string): CapabilityAdapter | undefined {
    const adapter = this.adapters.get(id);
    if (!adapter) return undefined;
    if (!this.suspended.has(id)) return adapter;
    // Preserve adapter methods while making the lifecycle fail closed.
    return {
      ...adapter,
      manifest: { ...adapter.manifest, lifecycle: "SUSPENDED" as const },
      checkAvailability: () => adapter.checkAvailability(),
      getState: target => adapter.getState(target),
      execute: request => adapter.execute(request),
      verify: (request, receipt) => adapter.verify(request, receipt)
    };
  }

  list(): readonly CapabilityAdapter["manifest"][] {
    return [...this.adapters.values()].map(adapter =>
      this.suspended.has(adapter.manifest.id)
        ? { ...adapter.manifest, lifecycle: "SUSPENDED" as const }
        : adapter.manifest
    );
  }

  suspend(id: string): void {
    if (!this.adapters.has(id)) throw new Error(`Unknown capability: ${id}`);
    this.suspended.add(id);
  }

  resume(id: string): never {
    if (!this.adapters.has(id)) throw new Error(`Unknown capability: ${id}`);
    throw new Error("Suspended capabilities require a reviewed deployment flow; direct resume is forbidden.");
  }
}
