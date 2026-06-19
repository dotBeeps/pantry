# GitHub GraphQL Patterns

Common queries using `gh api graphql`. Always use `-F` for variables, never string interpolation.

## Repository Stats

```bash
gh api graphql -F owner='dotBeeps' -F repo='project' -f query='
  query($owner: String!, $repo: String!) {
    repository(owner: $owner, name: $repo) {
      stargazerCount
      forkCount
      issues(states: OPEN) { totalCount }
      pullRequests(states: OPEN) { totalCount }
      defaultBranchRef { name }
    }
  }
'
```

## Search PRs by Author

```bash
gh api graphql -F query='
  query {
    search(query: "repo:owner/repo is:pr author:username is:open", type: ISSUE, first: 20) {
      nodes {
        ... on PullRequest {
          number
          title
          createdAt
          reviewDecision
        }
      }
    }
  }
'
```

## PR with Review Status

```bash
gh api graphql -F number=55 -F owner='owner' -F repo='repo' -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        title
        reviewDecision
        reviews(first: 10) {
          nodes {
            author { login }
            state
            body
          }
        }
        statusCheckRollup: commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                contexts(first: 20) {
                  nodes {
                    ... on CheckRun { name conclusion status }
                    ... on StatusContext { context state }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
'
```

## Pagination

For large result sets, use `--paginate` with `pageInfo`:

```bash
gh api graphql --paginate -F owner='owner' -F repo='repo' -f query='
  query($owner: String!, $repo: String!, $endCursor: String) {
    repository(owner: $owner, name: $repo) {
      issues(first: 100, after: $endCursor, states: OPEN) {
        nodes { number title }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
'
```

**Pagination rules:**
- Include `$endCursor: String` in query variables (no default value)
- Include `pageInfo { hasNextPage endCursor }` in the response
- Use `--paginate` flag — gh handles the cursor automatically
- Add `--slurp` to collect all pages into a single JSON array

## Variable Types

| Flag | Type | Example |
|------|------|---------|
| `-f` | String | `-f query='...'` |
| `-F` | Non-string (Int, Boolean, Enum) | `-F number=55` |
| `-F` | String variable | `-F owner='dotBeeps'` |

**Rule:** Use `-f` for the query itself, `-F` for all variables. gh auto-detects string vs non-string for `-F`.

## Useful Fragments

### Label details
```graphql
fragment LabelInfo on Label {
  name
  color
  description
}
```

### Author info
```graphql
fragment AuthorInfo on Actor {
  login
  ... on User { name }
}
```

Use fragments with `...LabelInfo` in queries to reduce repetition across multiple queries in scripts.
