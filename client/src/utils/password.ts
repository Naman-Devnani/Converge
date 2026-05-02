const W1 = ['mango', 'river', 'cloud', 'storm', 'ocean', 'tiger', 'amber', 'frost', 'coral', 'maple'];
const W2 = ['lake', 'peak', 'star', 'moon', 'wave', 'hill', 'wind', 'rain', 'dawn', 'dusk'];

export function generatePassword(): string {
  const w1 = W1[Math.floor(Math.random() * W1.length)];
  const w2 = W2[Math.floor(Math.random() * W2.length)];
  const n  = Math.floor(Math.random() * 90) + 10;
  return `${w1}-${w2}-${n}`;
}
