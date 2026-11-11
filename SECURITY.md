# Security

## Reporting a problem

Please don't open a public issue for a security problem. Report it privately instead:
[Report a vulnerability](https://github.com/curyantony-code/matcha-momentum-generator/security/advisories/new)
(the repository's Security tab). Only the maintainers can read it.

Say what you found, the steps to see it, the version (the installer's file name has it) and your system
(macOS or Windows, and its version). A short video or a sample `project.json` helps. Never send your own API
keys or tokens; we'll never ask for them.

We'll reply within 7 days, keep you posted while we fix it, and credit you in the release notes unless you'd
rather not be named.

## Supported versions

Only the latest release gets security fixes. Matcha Momentum Generator is a fork of Reel Studio: if the
problem is in code we share with upstream, we'll tell the upstream project once it's fixed here, with your
permission.

## What counts

The app runs on your own computer and edits your own videos. These are in scope:

- The page asking the main process for something it shouldn't get: opening a folder outside the app's own
  folders, launching a program, reaching a network share, or opening a link outside the allowed sites
  (`app/src/main/guards.ts`).
- A video, project file, template or AI reply that runs code, or reads or writes files outside the project.
- API keys or tokens leaving the computer, or being written somewhere other than the app's protected store.
- A download the installer build makes (the Python runtime, FFmpeg, fonts) being swapped without the build
  noticing: each one is checked against a pinned SHA-256.

Out of scope: problems that need someone to already control your computer or your user account, and
anything in a third-party service the app talks to (report those to that service).
