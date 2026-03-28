# Persistent Storage Migration Instructions For Other AI Agents

Use this guide when a project currently stores important data in memory or inside a replaceable release folder, and deployments are wiping out user data.

This document describes the desired behavior, folder layout, merge rules, Linux deployment behavior, localhost behavior, and implementation checklist.

## Goal

Change the project so deployments do **not** delete user-created or server-created data.

The final system must:

- persist all mutable backend data
- keep localhost development working on Mac without needing a permanent server setup
- let bundled data created on localhost travel with the project folder
- on Linux, merge bundled project data into a persistent storage file outside the release folder
- auto-create any missing folders/files
- support many websites living under one shared `websites/storage` parent without collisions

## Core Principle

Separate these two things:

- **Bundled project data**: data that ships inside the project folder and can be copied from localhost to Linux during deploy
- **Persistent server data**: data that must survive server restarts and folder replacements

The project folder is disposable.
The persistent storage folder is not.

## Required Behavior

### Localhost / Mac behavior

On localhost, the app should use a JSON file inside the project folder.

Example:

- project code: `/Users/name/project`
- bundled data file: `/Users/name/project/server/data/app-data.json`

This file should:

- be created automatically if it does not exist
- be written whenever mutable data changes
- travel with the project folder when copied to Linux

There is no need for a dedicated permanent storage folder on Mac if the Mac is only used for local testing and preparing releases.

### Linux behavior

On Linux, if the project is running somewhere inside a `websites` folder, the app should automatically use a persistent storage file under:

- `.../websites/storage/<site-key>/app-data.json`

Example:

- project folder: `/home/me/websites/cirkit`
- persistent storage file: `/home/me/websites/storage/cirkit/app-data.json`

This path must be created automatically if missing.

If multiple websites exist, each site must get its own subfolder under `websites/storage/`.
Do **not** dump all sites into one shared JSON file.

## Site Key Rule

The site key should usually be the first folder directly under `websites`.

Examples:

- `/home/me/websites/cirkit` -> site key `cirkit`
- `/home/me/websites/mathsite` -> site key `mathsite`

Allow an override env var such as `SITE_KEY` or project-specific equivalent if needed.

## What Must Be Persisted

Persist **everything mutable** that matters to the app.

Typical examples:

- user accounts / profile records
- auth-linked user records
- private projects
- public/shared projects
- uploaded content metadata
- toolbox/library/custom component records
- practice problems created through the app
- next-ID counters or any other server-generated identifiers
- admin-created content if it can change while the app is running

Do **not** leave important state only in:

- in-memory arrays
- module-level variables
- release folders that get replaced on deploy

If a value changes at runtime and losing it would matter, persist it.

## Merge Model

Use **merge**, not replace.

Reason:

- localhost may create bundled data that should be deployed later
- the Linux server may already contain older persistent data
- users may also create new data on the live server

The Linux server should import bundled project data into persistent storage without wiping existing server data.

## Item Identity

To merge correctly, every mergeable record needs a stable identity.

Use one of these:

- a stable string key such as `problem-ohms-law-01`
- a stable UUID stored with the item
- an existing unique external identity such as Google `sub` for users

Important:

- numeric IDs alone are usually not enough for cross-file merges
- titles are not reliable identities
- if two items are “equal” conceptually, they still need a stable key so the merge can recognize them

This applies even if authored items and user items are treated the same. If all items are equal, they still need stable identities.

## Merge Rules

When importing bundled project data into persistent Linux storage:

1. If a bundled item has a key that already exists in persistent storage:
   update that existing item in place
2. If a bundled item key does not exist in persistent storage:
   add it
3. If a persistent item exists and is not present in the bundled file:
   keep it

This prevents deploys from deleting live server data.

### User matching

If the project has signed-in users, match them by their real stable identity:

- Google `sub`
- auth provider subject
- email only if that is truly stable and intended

Do not create duplicate users on every import.

## One-Time Import Rule

Do **not** re-import the same bundled data on every restart.

Store metadata inside persistent storage such as:

- schema version
- list of already imported bundled snapshot hashes

Recommended approach:

1. Read bundled project JSON
2. Hash its raw contents
3. Check if that hash was already imported into persistent storage
4. If not imported yet, merge it and record the hash
5. If already imported, skip merge

This prevents duplicate imports from repeated restarts of the same release.

## File / Folder Creation Rules

The code must create missing directories and files automatically.

Required behavior:

- if bundled project data file does not exist, create it with an empty valid structure
- if Linux persistent storage directories do not exist, create them recursively
- if Linux persistent storage file does not exist, create it automatically

Use atomic writes where possible:

- write to a temp file
- rename into place

This reduces corruption risk.

## Safety Rules

If a storage JSON file is malformed:

- do **not** silently replace it with an empty file
- fail startup loudly
- log which file is invalid

Silent fallback to empty storage can destroy real data on the next write.

## Suggested Data File Shape

Use a single structured JSON file unless the project clearly needs a more advanced store.

Example:

```json
{
  "nextUserId": 1,
  "nextProjectId": 1,
  "users": [],
  "projects": [],
  "toolboxItems": [],
  "metadata": {
    "schemaVersion": 1,
    "appliedBundledSnapshotHashes": []
  }
}
```

Adapt collection names to the project.

## Recommended Implementation Plan

1. Inspect the backend and list every mutable collection and counter.
2. Create a dedicated storage module responsible for:
   - reading JSON
   - normalizing/validating data
   - resolving bundled path
   - resolving Linux persistent path
   - creating folders/files
   - saving atomically
   - merging bundled data into persistent data once
3. Replace in-memory-only arrays/objects with data loaded from the storage module.
4. Save after every mutation route or service action.
5. Keep API responses unchanged unless the app needs new fields.
6. Add stable keys to mergeable item types if they do not already exist.
7. Add startup logging that clearly states:
   - whether bundled mode or external mode is active
   - the bundled file path
   - the persistent file path if external mode is active
8. Build and test both modes.

## Path Resolution Strategy

Use this priority order:

1. Explicit env var for full storage file path
2. Explicit env var for storage directory
3. Automatic Linux `websites/storage/<site-key>/...` path
4. Otherwise use bundled project JSON inside the repo

This keeps the system flexible while still working automatically.

## Linux Auto-Detection Strategy

Recommended behavior:

1. Determine project root
2. Walk upward until an ancestor folder named `websites` is found
3. Determine the site key from the first folder directly below `websites`
4. Build:
   `websites/storage/<site-key>/app-data.json`

If no `websites` ancestor is found, fall back to bundled/local mode unless an env var explicitly points somewhere else.

## Localhost Deployment Workflow

Expected workflow:

1. Run project locally on Mac
2. Create or edit data through the app
3. Local changes are written into the bundled project JSON
4. Copy the project folder to Linux as a new release
5. Start the app on Linux
6. Linux merges bundled project JSON into persistent storage once
7. Future restarts of the same release do not re-import

## Important Non-Deletion Rule

Deploying a new release should **not** delete live persistent data.

If an item disappears from the bundled project JSON in a later release, that alone should not remove it from persistent storage.

If a project needs true deletions, that should be implemented deliberately with a separate deletion mechanism, not as a side effect of deployment.

## Verification Checklist

After implementation, verify all of the following:

- local mode creates bundled JSON automatically if missing
- local mode saves new accounts/data/projects/toolbox items
- external Linux mode creates `websites/storage/<site-key>/` automatically
- external Linux mode creates the persistent JSON automatically
- first Linux start imports bundled data into persistent storage
- second Linux start with same release does not duplicate imports
- private items still load correctly
- public items still load correctly
- account records still work after restart
- toolbox/library/custom items still work after restart
- malformed JSON causes a loud startup failure instead of data reset

## What To Tell The User After Implementing

Explain these points clearly:

- which data is now persisted
- where localhost data is stored
- where Linux persistent data is stored
- whether folders/files are auto-created
- how bundled-to-persistent merge works
- how duplicate imports are prevented
- any env vars available for overrides
- any remaining limits or future migration concerns

## If The Project Is Too Complex For Flat JSON

If the project has heavy concurrent writes, relational queries, or large-scale data, use the same architecture but swap the persistent storage layer to a real database.

The important architectural rules still stay the same:

- project folder is disposable
- persistent data lives outside releases
- localhost data can be bundled
- Linux imports bundled data into persistent storage
- imports are idempotent

## Short Prompt You Can Give Another AI

Use this if you want to hand the task to another AI quickly:

> Migrate this project so mutable backend data is persisted instead of being lost on deploy. Localhost on Mac should store bundled data inside the project folder and auto-create that JSON if missing. On Linux, if the app is inside a `websites` folder, it should automatically use `websites/storage/<site-key>/app-data.json`, create folders/files automatically, and merge bundled project data into persistent storage once per bundled snapshot instead of replacing existing data. Persist all mutable collections and counters, use stable keys for mergeable records, fail loudly on malformed storage JSON, and verify both localhost and Linux-style storage modes.
