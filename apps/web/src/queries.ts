import { PreviewResult } from "@sargunv/rubberstamp-core";
import {
  queryOptions,
  skipToken,
  useIsMutating,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as v from "valibot";

import {
  getLog,
  getMe,
  getPreview,
  getRepo,
  getRepos,
  runPreview,
  signOut,
} from "./api.ts";

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: getMe,
  // The session lasts hours; a sign-out clears it explicitly.
  staleTime: Infinity,
});

export const reposQuery = queryOptions({
  queryKey: ["repos"],
  queryFn: getRepos,
});

export const repoQuery = (repo: string) =>
  queryOptions({
    queryKey: ["repo", repo],
    queryFn: () => getRepo(repo),
  });

export const logQuery = (repo: string) =>
  queryOptions({
    queryKey: ["repo", repo, "log"],
    queryFn: () => getLog(repo),
  });

export const previewQuery = (repo: string) =>
  queryOptions({
    queryKey: ["repo", repo, "preview"],
    queryFn: () => getPreview(repo),
  });

export type Progress = { done: number; total: number };

const previewMutationKey = (repo: string) => ["preview", repo];
const progressKey = (repo: string) => ["repo", repo, "preview", "progress"];

/**
 * Run a preview. Its progress and result live in the query cache, so they
 * survive switching tabs while it runs.
 */
export function useRunPreview(repo: string) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: previewMutationKey(repo),
    mutationFn: (): Promise<PreviewResult> =>
      runPreview(repo, (done, total) =>
        queryClient.setQueryData<Progress>(progressKey(repo), { done, total }),
      ),
    onMutate: () => queryClient.removeQueries({ queryKey: progressKey(repo) }),
    onSuccess: async (result) => {
      if (!result.ok) return;
      queryClient.setQueryData(previewQuery(repo).queryKey, {
        preview: result.preview,
      });
      // The run spent from the budget the repository's status shows.
      await queryClient.invalidateQueries({
        queryKey: repoQuery(repo).queryKey,
        exact: true,
      });
    },
  });
  const running = useIsMutating({ mutationKey: previewMutationKey(repo) }) > 0;
  const progress = useQuery<Progress>({
    queryKey: progressKey(repo),
    queryFn: skipToken,
  }).data;
  const [latest] = useMutationState({
    filters: { mutationKey: previewMutationKey(repo) },
    select: (m) => ({
      data: v.is(PreviewResult, m.state.data) ? m.state.data : undefined,
      error: m.state.error,
    }),
  }).toReversed();
  const error =
    latest?.error instanceof Error
      ? latest.error.message
      : latest?.data && !latest.data.ok
        ? latest.data.error
        : null;
  return { run: () => mutation.mutate(), running, progress, error };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      queryClient.clear();
      queryClient.setQueryData(meQuery.queryKey, null);
      await navigate({ to: "/" });
    },
  });
}
