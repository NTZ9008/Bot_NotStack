# Contributing to Bot_NotStack

Thanks for helping out! Bug reports, ideas, documentation fixes and pull requests are all welcome.
Issues and pull requests may be written in **English or Thai**.

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/NTZ9008/Bot_NotStack/issues) with:

- what you did and what you expected to happen
- what happened instead, including error messages or logs (remove tokens, passwords and IDs you don't want public)
- where it happened: a slash command, a dashboard page or a Discord event, and the version or branch you are running

Don't report a security vulnerability in a public issue. Ask a maintainer ([@NTZ9008](https://github.com/NTZ9008) or
[@boatngin](https://github.com/boatngin)) for a private channel first, for example with an issue that only says you have a security report.

## Setting up

Follow [Getting started](README.md#getting-started) and [Development](README.md#development) in the README. In short:

```bash
pnpm install
pnpm dev
```

> [!WARNING]
> `pnpm dev` reads the root `.env`. Never develop against the production bot token or database. Create `apps/backend/.env`
> with an empty `TOKEN=` and the `DATABASE_URL` of a throwaway PostgreSQL instance; it overrides the root file.

## Branches

- Work for the next version happens on a release branch (`release/v.X.Y.Z`). Releases are merged into `main`.
- Branch from the current release branch and name it after the change: `feat/…`, `fix/…`, `docs/…`, `test/…`, `refactor/…` or `chore/…`.
- Open your pull request against that release branch, not `main`.

## Before you push

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

If you touched the database, migrations or the XP system, also run `pnpm test:integration`.
It needs `initdb`, `pg_ctl` and `createdb` on `PATH`, creates its own temporary cluster and never uses your `DATABASE_URL`.

CI runs the same checks on every pull request. It also verifies that `schema.prisma` matches the migrations.

## Code guidelines

- Match the style of the file you are editing. Existing code comments are mostly in Thai; either language is fine.
- Put types and zod schemas shared by the API and the dashboard in `packages/shared`, and build backend DTOs from them with `createZodDto`.
- API routes use only `GET` and `POST`, because Cloudflare blocks `PATCH` and `DELETE` in front of the backend.
- Discord event handlers go in a module's `listeners/` folder as `@OnDiscord(Events.X)` methods.
  Slash commands are `@SlashCommand()` classes with a `static data` builder in `apps/backend/src/commands/slash`.
- Every setting is per server. New chat features that delete messages or reply on their own must start **off** for new servers.
- Dashboard pages use the shadcn/ui components in `apps/frontend/src/components/ui` and the colour tokens in `apps/frontend/src/index.css`.
- Add tests in `tests/` (Node's built-in `node:test`) for new behaviour, especially permissions, quotas and anything that changes data.

## Database changes

1. Edit `apps/backend/prisma/schema.prisma`.
2. Create a migration against a **throwaway** database:

    ```bash
    cd apps/backend && pnpm exec prisma migrate dev --name <name>
    ```

3. Keep migrations additive where you can, and never edit a migration that has already been applied.
4. If the migration cannot be reversed or rewrites existing data, say so in the pull request.

## Commit messages

Use the same style as the existing history:

```text
feat(rank): image rank cards, leaderboard, level-up announcements and reward roles
fix(rank): rate-limit card preview rendering (90 per minute)
docs(logs): explain appearance controls and event settings
```

Common types are `feat`, `fix`, `perf`, `refactor`, `test`, `docs` and `chore`, with an optional scope such as `rank`, `levels`, `dashboard` or `logs`.

## Pull request description

Describe:

- **What changed:** new commands, dashboard pages, API routes and behaviour changes.
- **Before / after deploy:** migrations, slash-command changes (`pnpm discord:deploy-commands`), new environment variables,
  and behaviour existing servers will notice.
- **Testing:** what you ran, and what you could not test, such as behaviour that needs a real Discord server.

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
Keep the existing copyright and attribution notices, including the [`NOTICE`](NOTICE) file.
