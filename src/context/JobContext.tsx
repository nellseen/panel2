import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { JobCategory, JobModel, JobOutputLine, ToastItem } from '../types';
import { cancelJob as cancelJobApi, fetchJobs, runServerJob, wsClient } from '../services/api';

interface JobContextValue {
  jobs: JobModel[];
  runningJobs: JobModel[];
  activeJobPerServer: Record<string, JobModel>;
  isJobsModalOpen: boolean;
  openJobsModal: () => void;
  closeJobsModal: () => void;
  runJob: (serverId: string, command: string, category?: JobCategory) => Promise<JobModel>;
  cancelJob: (jobId: string) => Promise<boolean>;
  getJob: (jobId: string) => JobModel | undefined;
  getActiveJobForServer: (serverId: string) => JobModel | undefined;
  syncJobs: () => Promise<void>;
}

const JobContext = createContext<JobContextValue | null>(null);

export interface JobProviderProps {
  children: React.ReactNode;
  activeServerId?: string | null;
  onNotify?: (title: string, variant?: ToastItem['variant'], description?: string) => void;
}

export const JobProvider: React.FC<JobProviderProps> = ({
  children,
  activeServerId,
  onNotify,
}) => {
  const [jobs, setJobs] = useState<JobModel[]>([]);
  const [isJobsModalOpen, setIsJobsModalOpen] = useState(false);
  const activeServerIdRef = useRef(activeServerId);

  useEffect(() => {
    activeServerIdRef.current = activeServerId;
  }, [activeServerId]);

  const syncJobs = useCallback(async () => {
    try {
      const res = await fetchJobs();
      setJobs(res.jobs || []);
    } catch {
      // Backend may be momentarily offline
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchJobs()
      .then((res) => {
        if (!cancelled) {
          setJobs(res?.jobs || []);
        }
      })
      .catch(() => {});

    const unsubStart = wsClient.on<{ job: JobModel }>('job_started', (payload) => {
      if (!payload?.job) return;
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === payload.job.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = payload.job;
          return next;
        }
        return [payload.job, ...prev];
      });
    });

    const unsubOutput = wsClient.on<{ jobId: string; serverId: string; line: JobOutputLine }>(
      'job_output',
      (payload) => {
        if (!payload?.jobId || !payload?.line) return;
        setJobs((prev) =>
          prev.map((j) => {
            if (j.id !== payload.jobId) return j;
            const existingOut = j.output || [];
            // Deduplicate lines by seq
            if (existingOut.some((l) => l.seq === payload.line.seq)) return j;
            return {
              ...j,
              output: [...existingOut.slice(-1999), payload.line],
            };
          })
        );
      }
    );

    const unsubFinish = wsClient.on<{
      jobId: string;
      serverId: string;
      exitCode: number | null;
      signal: string | null;
      durationMs: number;
      status: JobModel['status'];
    }>('job_finished', (payload) => {
      if (!payload?.jobId) return;

      setJobs((prev) =>
        prev.map((j) => {
          if (j.id !== payload.jobId) return j;
          const updated: JobModel = {
            ...j,
            status: payload.status,
            exitCode: payload.exitCode,
            signal: payload.signal,
            durationMs: payload.durationMs,
            endTime: new Date().toISOString(),
          };

          // If job finished while user is NOT actively in this server view, alert them via toast!
          if (activeServerIdRef.current !== j.serverId) {
            const isSuccess = payload.status === 'completed';
            const serverLabel = j.serverName ? ` on "${j.serverName}"` : '';
            onNotify?.(
              isSuccess ? 'Background Job Completed' : 'Background Job Failed',
              isSuccess ? 'success' : 'error',
              `"${j.command}"${serverLabel} finished with code ${payload.exitCode ?? 0} (${(payload.durationMs / 1000).toFixed(1)}s)`
            );
          }

          return updated;
        })
      );
    });

    const unsubReconnect = wsClient.on('reconnected', () => {
      void syncJobs();
    });

    const pollTimer = setInterval(() => {
      void syncJobs();
    }, 6000);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      unsubStart();
      unsubOutput();
      unsubFinish();
      unsubReconnect();
    };
  }, [syncJobs, onNotify]);

  const runningJobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');

  const activeJobPerServer = runningJobs.reduce<Record<string, JobModel>>((acc, j) => {
    acc[j.serverId] = j;
    return acc;
  }, {});

  const runJob = useCallback(
    async (serverId: string, command: string, category: JobCategory = 'command'): Promise<JobModel> => {
      const res = await runServerJob(serverId, command, category);
      setJobs((prev) => [res.job, ...prev.filter((j) => j.id !== res.job.id)]);
      return res.job;
    },
    []
  );

  const cancelJob = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      await cancelJobApi(jobId);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'cancelled' } : j))
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const getJob = useCallback(
    (jobId: string): JobModel | undefined => {
      return jobs.find((j) => j.id === jobId);
    },
    [jobs]
  );

  const getActiveJobForServer = useCallback(
    (serverId: string): JobModel | undefined => {
      return activeJobPerServer[serverId];
    },
    [activeJobPerServer]
  );

  const openJobsModal = useCallback(() => setIsJobsModalOpen(true), []);
  const closeJobsModal = useCallback(() => setIsJobsModalOpen(false), []);

  const value: JobContextValue = {
    jobs,
    runningJobs,
    activeJobPerServer,
    isJobsModalOpen,
    openJobsModal,
    closeJobsModal,
    runJob,
    cancelJob,
    getJob,
    getActiveJobForServer,
    syncJobs,
  };

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
};

export function useJobs(): JobContextValue {
  const ctx = useContext(JobContext);
  if (!ctx) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return ctx;
}
