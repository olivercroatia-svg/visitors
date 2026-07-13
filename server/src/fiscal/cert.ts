import crypto from 'crypto';
import type { KeyObject } from 'crypto';
import forge from 'node-forge';

// Loading the taxpayer's advanced certificate. Node's crypto cannot parse PKCS#12, hence
// node-forge: it turns the .p12 the taxpayer gets from FINA (or any eIDAS trust provider
// on the EU trusted list) into a private key and an X.509 certificate we can sign with.
//
// The certificate is used ONLY to sign — the TLS channel to the tax authority is 1-way,
// so it is never presented as a client certificate.

export interface FiscalCert {
  privateKey: KeyObject;
  /** DER certificate, base64 — goes verbatim into <X509Certificate>. */
  certificateBase64: string;
  certificatePem: string;
  /** RFC 2253-ish issuer DN — goes into <X509IssuerName>. */
  issuerName: string;
  /** Decimal serial — goes into <X509SerialNumber>. */
  serialNumber: string;
  /** OIB pulled out of organizationIdentifier (OID 2.5.4.97), format "VATHR-<oib>". */
  oib: string | null;
  validFrom: Date;
  validTo: Date;
}

export class CertError extends Error {}

export function loadP12(p12: Buffer, password: string): FiscalCert {
  let bag: { key: forge.pki.PrivateKey | null; cert: forge.pki.Certificate | null };
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12.toString('binary')));
    const p12Obj = forge.pkcs12.pkcs12FromAsn1(asn1, password);
    bag = extractBags(p12Obj);
  } catch (err) {
    // Wrong password and a corrupt file surface the same way from forge, and the taxpayer
    // can act on both, so say both.
    throw new CertError(
      'Certifikat nije moguće otvoriti. Provjerite je li lozinka ispravna i je li datoteka .p12 valjana.',
    );
  }

  if (!bag.key) throw new CertError('Certifikat ne sadrži privatni ključ.');
  if (!bag.cert) throw new CertError('Certifikat ne sadrži javni certifikat.');

  const certPem = forge.pki.certificateToPem(bag.cert);
  const keyPem = forge.pki.privateKeyToPem(bag.key as forge.pki.rsa.PrivateKey);
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(bag.cert)).getBytes();

  return {
    privateKey: crypto.createPrivateKey(keyPem),
    certificateBase64: forge.util.encode64(der),
    certificatePem: certPem,
    issuerName: formatDn(bag.cert.issuer.attributes),
    serialNumber: BigInt(`0x${bag.cert.serialNumber}`).toString(10),
    oib: extractOib(bag.cert),
    validFrom: bag.cert.validity.notBefore,
    validTo: bag.cert.validity.notAfter,
  };
}

function extractBags(p12: forge.pkcs12.Pkcs12Pfx) {
  const keyBags = {
    ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
    ...p12.getBags({ bagType: forge.pki.oids.keyBag }),
  };
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const key =
    Object.values(keyBags)
      .flat()
      .find((b) => b?.key)?.key ?? null;

  // A .p12 usually carries the whole chain; the leaf is the one that has our private key,
  // and in practice it is the first cert bag. Prefer one with an OIB, which the CA chain
  // certificates do not have.
  const certs = (certBags[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));

  const cert = certs.find((c) => extractOib(c) !== null) ?? certs[0] ?? null;

  return { key, cert };
}

// ETSI EN 319 412-3 v1.4.0: organizationIdentifier is written as "VATHR-12345678901".
// The tax authority rejects the message (s005) if this OIB differs from the one in the
// invoice, so we read it here and check before sending rather than after a rejection.
function extractOib(cert: forge.pki.Certificate): string | null {
  const attrs = [...cert.subject.attributes];
  for (const a of attrs) {
    const value = typeof a.value === 'string' ? a.value : '';
    if (a.type === '2.5.4.97' || a.shortName === 'organizationIdentifier') {
      const m = /^VAT([A-Z]{2})-(\d{11})$/.exec(value.trim());
      if (m) return m[2];
    }
  }
  // Older FINA fiscal certificates carried the OIB in the CN instead.
  const cn = attrs.find((a) => a.shortName === 'CN');
  const cnValue = typeof cn?.value === 'string' ? cn.value : '';
  const m = /\b(\d{11})\b/.exec(cnValue);
  return m ? m[1] : null;
}

function formatDn(attributes: forge.pki.CertificateField[]): string {
  return attributes
    .slice()
    .reverse()
    .map((a) => `${a.shortName ?? a.name ?? a.type}=${a.value}`)
    .join(',');
}
