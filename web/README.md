# printD – web app

The Next.js app behind printD. Setup, configuration, printer setup and deployment are
described in the [main README](../README.md).

```sh
pnpm install
cp .env.example .env.local   # local settings, see the main README
pnpm dev                     # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | ESLint |
| `npx tsc --noEmit` | Type check |
