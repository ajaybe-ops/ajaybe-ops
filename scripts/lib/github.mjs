/**
 * Minimal GitHub REST client (no dependencies) used by the repository's
 * automation scripts. Only the endpoints those scripts need are implemented.
 */

const DEFAULT_API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.body = body;
  }
}

export function createGitHubClient({ token, repo, fetchImpl = fetch, api = DEFAULT_API, userAgent = 'matrix-arcade-bot' } = {}) {
  if (!repo) throw new Error('repo is required (owner/name)');

  async function request(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
    const response = await fetchImpl(`${api}${path}`, {
      method,
      headers: {
        accept,
        'x-github-api-version': '2022-11-28',
        'user-agent': userAgent,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (response.status === 204) return null;
    const text = await response.text();
    const parsed = text ? safeJson(text) : null;

    if (!response.ok) {
      throw new GitHubError(`${method} ${path} failed with ${response.status}`, response.status, parsed);
    }
    return parsed;
  }

  /** @returns {{content:string, sha:string}|null} */
  async function getFile(path, ref) {
    try {
      const data = await request(`/repos/${repo}/contents/${encodeURI(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
      if (Array.isArray(data) || !data?.content) return null;
      return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  async function putFile(path, content, { message, sha, branch } = {}) {
    return request(`/repos/${repo}/contents/${encodeURI(path)}`, {
      method: 'PUT',
      body: {
        message: message || `chore: update ${path}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(sha ? { sha } : {}),
        ...(branch ? { branch } : {}),
      },
    });
  }

  async function createComment(issueNumber, body) {
    return request(`/repos/${repo}/issues/${issueNumber}/comments`, { method: 'POST', body: { body } });
  }

  async function createIssue({ title, body, labels }) {
    return request(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, ...(labels ? { labels } : {}) } });
  }

  async function getAuthenticatedUser() {
    return request('/user');
  }

  return { request, getFile, putFile, createComment, createIssue, getAuthenticatedUser };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
