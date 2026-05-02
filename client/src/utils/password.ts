const W1 = ['mango', 'river', 'cloud', 'storm', 'ocean', 'tiger', 'amber', 'frost', 'coral', 'maple'];
const W2 = ['lake', 'peak', 'star', 'moon', 'wave', 'hill', 'wind', 'rain', 'dawn', 'dusk'];

// L-10: Use CSPRNG (crypto.getRandomValues) instead of Math.random().
export function generatePassword(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  const w1 = W1[buf[0] % W1.length];
  const w2 = W2[buf[1] % W2.length];
  const n  = (buf[2] % 90) + 10;
  return `${w1}-${w2}-${n}`;
}
