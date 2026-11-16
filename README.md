# Rooks open source

Public packages for [Rooks](https://rooks.ai) forms.

| Package                                     | Description                    |
| ------------------------------------------- | ------------------------------ |
| [`@rooks-ai/web-embed`](packages/web-embed) | Embed Rooks forms in web pages |

## Development

Use Node 24 (see `.nvmrc`) and the pnpm version in `package.json` (`corepack enable pnpm`).

```sh
pnpm install
pnpm build
pnpm --filter @rooks-ai/web-embed exec playwright install chromium
pnpm test
```

`pnpm test` runs the tests in a real browser and needs `pnpm build` first.

Other checks: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm check:package`.

## Releases

See [RELEASING.md](RELEASING.md).

## Security

See [SECURITY.md](SECURITY.md).
