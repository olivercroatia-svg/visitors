import { SignedXml } from 'xml-crypto';
import { env } from '../config/env';
import type { FiscalCert } from './cert';
import { RACUN_ROOT_ID } from './xml';

// Enveloped XML-DSig over the request root (Tehnička specifikacija v2.7, ch. 7).
//
// Exclusive canonicalization is mandatory. Plain c14n yields a different digest and the
// authority answers s004 ("neispravan digitalni potpis") without saying why — which is
// precisely why the canonicalization is done by a library and not by hand.
//
// RSA-SHA1 is deliberately unsupported: the test environment rejects it from 2026-07-01
// and production from 2027-01-01.

const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

// The W3C URIs for RSA-SHA256 / SHA-256. Every XML-DSig implementation resolves these.
const STD_SIGNATURE = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const STD_DIGEST = 'http://www.w3.org/2001/04/xmlenc#sha256';

// ...and the URIs the v2.7 spec actually prints (ch. 7). They do not exist in the W3C
// registry — the `#rsa-sha256` and `#sha256` names live in the xmldsig-more / xmlenc
// namespaces, not in xmldsig — so they look like a find/replace of "sha1" -> "sha256" in
// the document. We cannot tell from the paper which one the service accepts, so we emit
// the standard ones (what a real verifier resolves) and keep these one env flag away.
const SPEC_SIGNATURE = 'http://www.w3.org/2000/09/xmldsig#rsa-sha256';
const SPEC_DIGEST = 'http://www.w3.org/2000/09/xmldsig#sha256';

const useSpecUris = env.fiscalXmldsigSpecUris;
const SIGNATURE_URI = useSpecUris ? SPEC_SIGNATURE : STD_SIGNATURE;
const DIGEST_URI = useSpecUris ? SPEC_DIGEST : STD_DIGEST;

// Teach xml-crypto the spec's spellings as aliases of the same algorithms, so we can both
// emit them and verify a response that uses them.
function registerAliases(sig: SignedXml): void {
  sig.SignatureAlgorithms[SPEC_SIGNATURE] = sig.SignatureAlgorithms[STD_SIGNATURE];
  sig.HashAlgorithms[SPEC_DIGEST] = sig.HashAlgorithms[STD_DIGEST];
}

export function signRacunZahtjev(xml: string, cert: FiscalCert): string {
  const sig = new SignedXml({
    privateKey: cert.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string,
    signatureAlgorithm: SIGNATURE_URI,
    canonicalizationAlgorithm: EXC_C14N,
  });
  registerAliases(sig);

  sig.addReference({
    xpath: `//*[local-name(.)='${RACUN_ROOT_ID}']`,
    transforms: [ENVELOPED, EXC_C14N],
    digestAlgorithm: DIGEST_URI,
    uri: `#${RACUN_ROOT_ID}`,
  });

  // KeyInfo carries the certificate plus its issuer/serial: the authority looks the
  // taxpayer up by it and checks that its OIB matches the one in the message (s005).
  sig.getKeyInfoContent = () =>
    `<X509Data>` +
    `<X509Certificate>${cert.certificateBase64}</X509Certificate>` +
    `<X509IssuerSerial>` +
    `<X509IssuerName>${cert.issuerName}</X509IssuerName>` +
    `<X509SerialNumber>${cert.serialNumber}</X509SerialNumber>` +
    `</X509IssuerSerial>` +
    `</X509Data>`;

  sig.computeSignature(xml, {
    location: { reference: `//*[local-name(.)='${RACUN_ROOT_ID}']`, action: 'append' },
  });

  return sig.getSignedXml();
}

/** Verifies a signature against a known certificate — used to self-check what we send. */
export function verifySignedXml(signedXml: string, certPem: string): boolean {
  const match = /<(?:\w+:)?Signature[\s\S]*<\/(?:\w+:)?Signature>/.exec(signedXml);
  if (!match) return false;

  const verifier = new SignedXml({ publicCert: certPem });
  registerAliases(verifier);
  verifier.loadSignature(match[0]);
  return verifier.checkSignature(signedXml);
}
