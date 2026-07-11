// Mirror of the server OIB check (ISO 7064 MOD 11,10) for instant feedback.
export function isValidOib(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  let remainder = 10;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + Number(value[i])) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }
  return (11 - remainder) % 10 === Number(value[10]);
}
