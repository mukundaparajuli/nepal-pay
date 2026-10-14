# @nepal-payments/cli

The `npay` command-line tool for the Nepal Payments SDK: scaffold env files,
smoke-test a gateway offline, validate fixtures, and convert connectIPS keys.

## Install

```bash
pnpm add -D @nepal-payments/cli
```

## Commands

```bash
npay init [options]                 # write a .env.example template
npay gateway test [gateway]         # smoke-test a gateway offline
npay fixtures validate [dir]        # validate JSON fixtures/vectors
npay connectips import-pfx <pfx>    # convert a connectIPS .pfx to PKCS#8
```

Run `npay <command> --help` for command options.

- **`npay init`** writes placeholder values only — it never invents or stores
  secrets. Existing files are left alone unless you pass `--force`.
- **`npay gateway test`** runs the full create-checkout → callback → verify →
  status lifecycle. It defaults to the `mock` gateway; naming a real gateway
  builds the adapter from environment variables and does not hit the network.
- **`npay fixtures validate`** parses the bundled JSON vectors and checks their
  structure and known status/error codes.

## Links

- [Full quickstart](https://github.com/mukundaparajuli/nepal-payments#readme)
- [connectIPS guide](https://github.com/mukundaparajuli/nepal-payments/blob/main/docs/connectips.md)

## License

MIT
