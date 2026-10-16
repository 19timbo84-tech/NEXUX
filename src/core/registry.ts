import type { CapabilityAdapter } from "./contracts.js";

export class CapabilityRegistry {
  private readonly adapters = new Map<string, CapabilityAdapter>();

  register(adapter: CapabilityAdapter): void {
    const id = adapter.manifest.id.trim();
    if (!id) throw new Error("Capability id cannot be empty.");
    if (this.adapters.has(id)) throw new Error(`Capability already registered: ${id}`);
    if (!adapter.manifest.version.trim() || !adapter.manifest.sourceHash.trim()) {
      throw new Error("Capability version and source hash are required.");
    }
    this.adapters.set(id, adapter);
  }

  get(id: string): CapabilityAdapter | undefined {
    return this.adapters.get(id);
  }

  list(): readonly CapabilityAdapter["manifest"][] {
    return [...this.adapters.values()].map(adapter => adapter.manifest);
  }

  suspend(id: string): void {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Unknown capability: ${id}`);
    // Replace with a frozen manifest so the same adapter can no longer pass policy.
    const suspended = {
      ...adapter,
      manifest: { ...adapter.manifest, lifecycle: "SUSPENDED" as const }
    };
    this.adapters.set(id, suspended);
  }
}
