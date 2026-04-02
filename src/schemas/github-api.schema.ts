import { z, type ZodSchema } from 'zod';

const searchRepos = z
  .object({
    query: z
      .string()
      .describe(
        'Search query (e.g. "mcp server", "react framework", "language:python stars:>1000")',
      ),
    sort: z
      .enum(['stars', 'forks', 'updated', 'help-wanted-issues'])
      .optional()
      .default('stars')
      .describe('Sort by: stars (default), forks, updated, help-wanted-issues'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .default(10)
      .describe('Max results (1-30, default 10)'),
  })
  .strip();

const user = z
  .object({
    username: z.string().describe('GitHub username (e.g. "torvalds", "whiteknightonhorse")'),
  })
  .strip();

const repo = z
  .object({
    owner: z.string().describe('Repository owner (e.g. "facebook", "microsoft")'),
    repo: z.string().describe('Repository name (e.g. "react", "vscode")'),
  })
  .strip();

export const githubApiSchemas: Record<string, ZodSchema> = {
  'github.search_repos': searchRepos,
  'github.user': user,
  'github.repo': repo,
};
