import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../config/env';
import type { DocumentOcrProvider, OcrContext, OcrResult, ScanImage } from './types';

// Sonnet 5: high-resolution vision (2576px on the long edge, so the MRZ and the small print
// survive) plus structured outputs. Both are load-bearing here — a passport number is small
// type, and a free-form answer would have to be parsed by hand.
const MODEL = 'claude-sonnet-5';

// Thinking counts against max_tokens, so the JSON needs headroom above it.
const MAX_TOKENS = 8000;

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableEnum = (values: string[]) => ({
  anyOf: [{ type: 'string', enum: values }, { type: 'null' }],
});

// Structured outputs require every property listed in `required` and additionalProperties:false.
// Nullability is expressed with anyOf, not by omitting the key — that is what lets the model
// say "not visible" instead of inventing a value.
const SCAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fields', 'mrz', 'document_kind', 'notes'],
  properties: {
    fields: {
      type: 'object',
      additionalProperties: false,
      required: [
        'first_name', 'last_name', 'middle_name', 'date_of_birth', 'gender',
        'doc_type', 'doc_number', 'doc_type_code', 'citizenship_code',
        'birth_country_code', 'birth_city', 'residence_country_code',
        'residence_city', 'residence_address', 'country',
      ],
      properties: {
        first_name: nullableString,
        last_name: nullableString,
        middle_name: nullableString,
        date_of_birth: nullableString,
        gender: nullableEnum(['muski', 'zenski']),
        doc_type: nullableEnum(['osobna', 'putovnica', 'ostalo']),
        doc_number: nullableString,
        doc_type_code: nullableString,
        citizenship_code: nullableString,
        birth_country_code: nullableString,
        birth_city: nullableString,
        residence_country_code: nullableString,
        residence_city: nullableString,
        residence_address: nullableString,
        country: nullableString,
      },
    },
    mrz: {
      anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
    },
    document_kind: {
      type: 'string',
      enum: ['passport', 'id_card', 'driving_licence', 'other'],
    },
    notes: nullableString,
  },
} as const;

// The schema constrains the shape; zod is what guarantees the shape we then trust in code.
const resultSchema = z.object({
  fields: z.object({
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    middle_name: z.string().nullable(),
    date_of_birth: z.string().nullable(),
    gender: z.enum(['muski', 'zenski']).nullable(),
    doc_type: z.enum(['osobna', 'putovnica', 'ostalo']).nullable(),
    doc_number: z.string().nullable(),
    doc_type_code: z.string().nullable(),
    citizenship_code: z.string().nullable(),
    birth_country_code: z.string().nullable(),
    birth_city: z.string().nullable(),
    residence_country_code: z.string().nullable(),
    residence_city: z.string().nullable(),
    residence_address: z.string().nullable(),
    country: z.string().nullable(),
  }),
  mrz: z.array(z.string()).nullable(),
  document_kind: z.enum(['passport', 'id_card', 'driving_licence', 'other']),
  notes: z.string().nullable(),
});

function buildSystemPrompt(ctx: OcrContext): string {
  const docTypeBlock = ctx.docTypesSynced && ctx.docTypes.length > 0
    ? `\nŠifre vrste dokumenta (doc_type_code) — odaberi ISKLJUČIVO iz ovog popisa:\n` +
      ctx.docTypes.map((d) => `${d.code} = ${d.label}`).join('\n')
    : `\nŠifrarnik vrste dokumenta nije dostupan. Postavi doc_type_code na null.`;

  return [
    'Čitaš fotografije identifikacijskog dokumenta (putovnica, osobna iskaznica) i vraćaš podatke o gostu za prijavu turista u Hrvatskoj.',
    '',
    'PRAVILA:',
    '1. Ako podatak NIJE JASNO VIDLJIV na fotografiji, vrati null. NIKADA ne pogađaj i ne izmišljaj.',
    '   Prazno polje korisnik lako popuni; kriv podatak MUP odbija i teško se otkriva.',
    '2. Ako je poslano više fotografija, to su strane/stranice ISTOG dokumenta. Spoji ih u jedan rezultat.',
    '3. Šifre država (citizenship_code, birth_country_code, residence_country_code) su ISO 3166-1 alpha-3',
    '   velikim slovima: HRV, DEU, ITA, SVN, AUT... Za Kosovo koristi XKX.',
    '4. Imena prepiši S DIJAKRITIKOM kako su otisnuta vizualno (Čavić, Šimun, Đurđica) — ne iz MRZ zone,',
    '   jer MRZ dijakritiku gubi.',
    '5. MRZ: prepiši linije DOSLOVNO, znak po znak, uključujući sve znakove <. Ne ispravljaj ih i ne',
    '   dopunjuj. Ako MRZ nije vidljiv, vrati null. Kontrolne znamenke provjeravamo sami.',
    '6. date_of_birth je u formatu YYYY-MM-DD.',
    '7. country je čitljiv naziv države prebivališta na hrvatskom (npr. "Njemačka").',
    '8. notes: kratko, na hrvatskom, napiši što nisi mogao pročitati i zašto (npr. "Adresa prebivališta',
    '   nije vidljiva — vjerojatno je na poleđini."). Ako je sve pročitano, vrati null.',
    docTypeBlock,
  ].join('\n');
}

export class AnthropicOcrProvider implements DocumentOcrProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  async extract(images: ScanImage[], ctx: OcrContext): Promise<OcrResult> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Adaptive is Sonnet 5's default, but stating it keeps the intent obvious at the call site.
      // NOTE: temperature / top_p / top_k are rejected with a 400 on this model — do not add them.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium', // default is 'high'; extraction does not need it
        format: { type: 'json_schema', schema: SCAN_SCHEMA as unknown as Record<string, unknown> },
      },
      system: buildSystemPrompt(ctx),
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((img) => ({
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: img.mediaType,
                data: img.base64,
              },
            })),
            {
              type: 'text' as const,
              text:
                images.length > 1
                  ? `Pročitaj svih ${images.length} fotografija — to su strane istog dokumenta — i vrati spojene podatke.`
                  : 'Pročitaj ovaj dokument i vrati podatke.',
            },
          ],
        },
      ],
    });

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      throw new Error('Model nije vratio podatke.');
    }

    const usage = response.usage;
    console.log(
      `[ocr] ${MODEL} images=${images.length} in=${usage.input_tokens} out=${usage.output_tokens}`,
    );

    return resultSchema.parse(JSON.parse(text.text));
  }
}
