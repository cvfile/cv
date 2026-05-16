# @cvfile/cv-detector (TypeScript)

```bash
pnpm add @cvfile/cv-detector
```

```ts
import { readFile } from 'node:fs/promises';
import { detect, unwrap } from '@cvfile/cv-detector';

const data = await readFile('resume.pdf');
const det = detect(data);
if (!det.isCvFile) {
  console.log('plain PDF, OCR as usual');
} else {
  const payload = await unwrap(data);
  if (payload) {
    const markdown = new TextDecoder().decode(payload.bytes);
    console.log(`got ${payload.name} (${payload.mimeType}, ${markdown.length} chars)`);
  }
}
```

`detect()` is dependency free (regex over PDF bytes, runs anywhere a
`Uint8Array` runs). `unwrap()` uses [`pdf-lib`](https://pdf-lib.js.org/) to
parse the `/AF` Associated Files array.

See `../README.md` for the cross-language story and rationale.
