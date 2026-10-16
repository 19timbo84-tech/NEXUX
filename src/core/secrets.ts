/**
 * Secret references only. Concrete values must be resolved by server-side
 * infrastructure and must never be passed into model prompts, mobile clients,
 * audit details, generated source files, or build workers.
 */
export interface SecretProvider {
  getSecret(reference: string): Promise<string>;
}

/** Namespaced opaque secret references avoid storing raw credentials in config. */
export function assertSecretReference(reference: string): void {
  if (!/^[a-z0-9][a-z0-9/_-]{2,127}$/i.test(reference)) {
    throw new Error("Invalid secret reference.");
  }
}
