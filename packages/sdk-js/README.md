# `@cvfile/sdk`

Reference SDK for the [`.cv`](https://cvfile.org) open file format. Pack, extract, inspect, and validate `.cv` files in Node, Bun, Deno, and the browser.

## Install

```bash
npm i @cvfile/sdk
```

## Pack

```ts
import { pack } from '@cvfile/sdk';
import { readFile } from 'node:fs/promises';

const cvBytes = await pack({
  pdf: await readFile('resume.pdf'),
  markdown: await readFile('resume.md', 'utf8'),
  html: await readFile('resume.html', 'utf8'),
  metadata: {
    primaryLanguage: 'en',
  },
});
```

## Extract

```ts
import { extract, extractMarkdown } from '@cvfile/sdk';

const file = await extract(cvBytes);
console.log(file.metadata.version);     // "0.1"
console.log(file.payloads.length);      // 2

const md = await extractMarkdown(cvBytes);
```

## Inspect

```ts
import { inspect } from '@cvfile/sdk';

const meta = await inspect(cvBytes);
// { version, primaryLanguage, primaryPayload, alternates, embeddings, ... }
```

## Browser-safe entry

The default `@cvfile/sdk` import is browser-safe (no `node:` modules). If you want filesystem helpers in Node, import from `@cvfile/sdk/node`:

```ts
import { packToFile, extractFromFile } from '@cvfile/sdk/node';
```

## License

Apache-2.0.
