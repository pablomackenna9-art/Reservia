const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // sin 0/O/1/l/I: se lee y se dicta sin confusión

/** Clave temporal legible, p. ej. "Kp7m-Zr3q-Wx9d" (12 caracteres + guiones). Usa el generador criptográfico del navegador. */
export function generatePassword(): string {
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join("")).join("-");
}
