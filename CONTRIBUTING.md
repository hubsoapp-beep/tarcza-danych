# Contributing

Issues and pull requests are welcome.

## Rules

- Use only made-up data in code, tests, issues and screenshots. Build numbers with a checksum
  at run time (see `plugins/redactor-pl/hooks/demo.ts`), so no real-looking value sits in the repo.
- A new detector needs two lists in `test/pl.test.mts`: values that must be hidden and values that must stay.
  A false positive in ordinary code is a bug as serious as a leak.
- Keep the upstream engine (`hooks/detect.ts`) changes small and described in the file header.

## Run the tests

```
cd plugins/redactor-pl
node --experimental-strip-types test/detect.test.mts
node --experimental-strip-types test/pl.test.mts
node --experimental-strip-types test/random-tags.test.mts
node --experimental-strip-types test/session-privacy.test.mts
node --experimental-strip-types test/pii-options.test.mts
claude plugin validate .
claude plugin test .
```

The last two need Claude Code. CI runs the first five.
