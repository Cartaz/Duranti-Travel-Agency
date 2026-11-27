/**
 * One minimum for every passphrase DTAgency asks the user to create. The Vault
 * protects the wrapped local document key, so it must not be weaker than the
 * local encryption passphrase. Existing backups made with shorter passwords
 * remain importable: the policy applies only when a new secret is chosen.
 */
export const MIN_PASSPHRASE_LENGTH = 12

export function passphrasePolicyError(passphrase: string): string | undefined {
  return passphrase.length < MIN_PASSPHRASE_LENGTH
    ? `Usa una password di almeno ${MIN_PASSPHRASE_LENGTH} caratteri.`
    : undefined
}
