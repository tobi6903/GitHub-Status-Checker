// `state` has a different enum type on Issue and PullRequest, so each gets its own alias.
export const ITEM_FIELDS = /* GraphQL */ `
  fragment ItemFields on Issue {
    __typename
    id
    number
    title
    url
    issueState: state
    createdAt
    updatedAt
    closedAt
    repository {
      nameWithOwner
    }
    author {
      login
    }
    comments {
      totalCount
    }
    labels(first: 5) {
      nodes {
        name
        color
      }
    }
  }
  fragment PRFields on PullRequest {
    __typename
    id
    number
    title
    url
    prState: state
    isDraft
    reviewDecision
    createdAt
    updatedAt
    closedAt
    mergedAt
    repository {
      nameWithOwner
    }
    author {
      login
    }
    comments {
      totalCount
    }
    labels(first: 5) {
      nodes {
        name
        color
      }
    }
  }
`;

export const SEARCH_QUERY = /* GraphQL */ `
  ${ITEM_FIELDS}
  query Search($q: String!, $first: Int!) {
    search(query: $q, type: ISSUE, first: $first) {
      issueCount
      nodes {
        ...ItemFields
        ...PRFields
      }
    }
  }
`;

// Everything the viewer did between $from and $to, plus PRs merged and issues closed in that window.
export const ACTIVITY_QUERY = /* GraphQL */ `
  ${ITEM_FIELDS}
  query Activity($from: DateTime!, $to: DateTime!, $merged: String!, $closed: String!) {
    viewer {
      login
      contributionsCollection(from: $from, to: $to) {
        commitContributionsByRepository(maxRepositories: 20) {
          repository {
            nameWithOwner
          }
          contributions(first: 100) {
            nodes {
              commitCount
            }
          }
        }
        pullRequestContributions(first: 30) {
          nodes {
            pullRequest {
              ...PRFields
            }
          }
        }
        pullRequestReviewContributions(first: 30) {
          nodes {
            pullRequestReview {
              state
              pullRequest {
                title
                url
                number
                repository {
                  nameWithOwner
                }
              }
            }
          }
        }
        issueContributions(first: 30) {
          nodes {
            issue {
              ...ItemFields
            }
          }
        }
      }
    }
    merged: search(query: $merged, type: ISSUE, first: 30) {
      nodes {
        ...PRFields
      }
    }
    closed: search(query: $closed, type: ISSUE, first: 30) {
      nodes {
        ...ItemFields
      }
    }
  }
`;
