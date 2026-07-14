import { useEffect, useState } from "react";
import { showApiError } from "../../shared/api/feedback";
import type { WorkProject } from "../../shared/api/types";
import { getWorkProject } from "../../shared/api/workProjects";

export type WorkProjectDetailsState = {
  project: WorkProject | null;
  loading: boolean;
};

export function useWorkProjectDetails(projectId: number | null, enabled = true): WorkProjectDetailsState {
  const [state, setState] = useState<WorkProjectDetailsState>({ project: null, loading: false });

  useEffect(() => {
    let canceled = false;
    if (!enabled || !projectId) {
      setState({ project: null, loading: false });
      return () => {
        canceled = true;
      };
    }

    setState({ project: null, loading: true });
    getWorkProject(projectId)
      .then((response) => {
        if (!canceled) setState({ project: response.data ?? null, loading: false });
      })
      .catch((error) => {
        if (!canceled) {
          showApiError(error);
          setState({ project: null, loading: false });
        }
      });

    return () => {
      canceled = true;
    };
  }, [enabled, projectId]);

  return state;
}
