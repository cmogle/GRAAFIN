# Vercel Direct Control (Token-Based)

## Why this
Interactive `vercel login` is fragile in agent workflows. Token auth is deterministic and non-interactive.

## One-time setup (you)
1. Create a Vercel token:
   - Vercel dashboard -> Settings -> Tokens -> Create.
2. Export token in your shell:
   - `export VERCEL_TOKEN=<your_token>`
3. Optional persistence:
   - Add the export to your shell profile (`~/.zshrc`) or use your secret manager.

## Usage (agent-safe)
Use the wrapper from repo root:

```bash
./scripts/vercel-token.sh whoami
./scripts/vercel-token.sh env ls
./scripts/vercel-token.sh env pull /tmp/graafin-prod.env --environment=production
```

The wrapper:
- requires `VERCEL_TOKEN`
- preflights `api.vercel.com` connectivity
- runs `vercel ... --token $VERCEL_TOKEN`

## If commands still fail
If you see `ENOTFOUND api.vercel.com`, this is DNS/network and not Vercel auth.
Once DNS resolves again, token-based commands will work without further changes.
