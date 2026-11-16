# Releasing

Releases use [craft](https://craft.sentry.dev) and npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers). No npm token exists. npm accepts
a publish only from `.github/workflows/release.yml` in the `release` environment of this repository.

## Release a package

1. Run the **Release** workflow from `main`. Select the package and type the version.
2. A person in the `release` environment approves the run.
3. craft does these steps:
   - It creates the branch `release/<package>/<version>`, bumps `package.json` and updates
     `CHANGELOG.md`.
   - CI runs on that branch and uploads the tarballs.
   - It publishes the package's tarball to npm with provenance.
   - It creates the tag and GitHub release `<package>@<version>`.
   - It merges the release branch into `main`.

If the publish fails after the branch exists, fix the cause and run the workflow again with the
same version.

## Add a new package

npm can trust a workflow only for a package that already exists. Thus, a person must publish the
first version by hand.

1. Create `packages/<name>` with `name`, `version`, `repository.url` and `repository.directory`
   like `packages/web-embed/package.json`.
2. Add `<name>` to the `package` options in `.github/workflows/release.yml`.
3. Publish a placeholder from a separate empty directory. Use your own npm account with 2FA:

   ```sh
   npm publish --access public
   ```

   The placeholder has only a `package.json` (version `0.0.0`, same `name` and `repository`) and
   a README.

4. On npmjs.com, open the package, then **Settings → Trusted publishing → GitHub Actions**:
   - Organization or user: `formsort`
   - Repository: `rooks-oss`
   - Workflow filename: `release.yml`
   - Environment name: `release`

   The configuration expires if the first publish with it does not occur in 2 days.

5. In **Settings → Publishing access**, select **Require two-factor authentication and disallow
   tokens**. Trusted publishing continues to work.
6. Release the first real version with the Release workflow.
7. Deprecate the placeholder:

   ```sh
   npm deprecate <package>@0.0.0 "Placeholder. Use a later version."
   ```

## One-time repository setup

- **Visibility**: public. npm makes provenance only for public repositories.
- **GitHub App** owned by the `formsort` organization, installed only on this repository. It
  keeps working when people leave. Repository permissions: Contents read and write, Actions read,
  Checks read, Commit statuses read. The Release workflow makes a one-hour token from it. craft
  pushes the release branch with that token. A push with `GITHUB_TOKEN` does not start CI, and
  craft waits for CI.
- **Environment** `release`: required reviewers, deployment only from protected branches,
  variable `RELEASE_APP_CLIENT_ID` (the app's Client ID) and secret `RELEASE_APP_PRIVATE_KEY`
  (a private key of the app).
- **Branch protection** for `main`: require a pull request with one approval and Code Owner
  review, and the `ci` status check. Block force pushes and deletion. Let the app bypass the pull
  request requirement, because craft pushes the merge of the release branch to `main`.
- **Teams**: `engineering` Maintain and `security-guild` Admin. CODEOWNERS needs teams with write
  access.
- **Tag ruleset** for `*@*`: block deletion and updates. Allow the app to create tags.
