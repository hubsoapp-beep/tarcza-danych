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

The OpenCode port shares the engine and adds a wiring test:

```
cd plugins/redactor-opencode
npm install
CI=1 npm test
```

CI runs that job too. Set `CI=1` locally if your machine is slower than the timing budget;
the budget is wider on a shared runner.

The Grok adapter has its own test:

```
cd adapters/grok
node --experimental-strip-types test/proxy.test.mts

cd adapters/gemini
node --experimental-strip-types test/hooks.test.mts

cd adapters/qwen
node --experimental-strip-types test/hooks.test.mts
```
