// Croatian OIB validation — 11 digits with an ISO 7064 MOD 11,10 check digit.
// A wrong OIB on an invoice is a real compliance risk, so we reject it early
// on both client and server.
export function isValidOib(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;

  let remainder = 10;
  for (let i = 0; i < 10; i++) {
    remainder = (remainder + Number(value[i])) % 10;
    if (remainder === 0) remainder = 10;
    remainder = (remainder * 2) % 11;
  }
  const control = (11 - remainder) % 10;
  return control === Number(value[10]);
}
