import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Square, Terminal, XCircle } from 'lucide-react';
import { useJobs } from '../context/JobContext';
import { JobModel } from '../types';
import { Badge, Button, Modal } from './ui';
import { stripAnsi } from '../utils/ansi';

export interface RunningJobsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectServer?: (serverId: string) => void;
}

export const RunningJobsModal: React.FC<RunningJobsModalProps> = ({
  isOpen,
  onClose,
  onSelectServer,
}) => {
  const { jobs, runningJobs, cancelJob } = useJobs();
  const [currentTimestamp, setCurrentTimestamp] = useState(0);

  // Update timer every second for live elapsed duration
  useEffect(() => {
    if (!isOpen || runningJobs.length === 0) return;
    const timer = setInterval(() => setCurrentTimestamp(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen, runningJobs.length]);

  const getDurationSec = (job: JobModel) => {
    if (job.durationMs !== undefined) {
      return (job.durationMs / 1000).toFixed(1);
    }
    const start = new Date(job.startTime).getTime();
    if (currentTimestamp === 0) {
      return '0.0';
    }
    return Math.max(0, Math.floor((currentTimestamp - start) / 1000)).toString();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Background Jobs Center"
      description="Supervised child execution processes running persistently across navigation changes."
      size="lg"
      footer={
        <Button variant="ghost" size="md" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {jobs.length === 0 ? (
          <div className="py-12 text-center text-[#697386] text-xs">
            No active or recent jobs found.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {jobs.map((job) => {
              const isRunning = job.status === 'running' || job.status === 'queued';
              const lastLine = job.output && job.output.length > 0 ? stripAnsi(job.output[job.output.length - 1].text) : '';

              return (
                <div
                  key={job.id}
                  className={`rounded-xl border p-3.5 transition-colors ${
                    isRunning
                      ? 'bg-[#10141D] border-amber-500/30'
                      : 'bg-[#0E1015] border-[#1F242D]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="p-1.5 rounded-lg bg-[#141822] text-emerald-400 shrink-0">
                        <Terminal className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#F3F5F8] truncate">
                            {job.command}
                          </span>
                          <Badge tone={job.category === 'install' ? 'info' : 'neutral'} mono>
                            {job.category}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-[#8A94A6] flex items-center gap-2 mt-0.5">
                          <span>{job.serverName || job.serverId}</span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{getDurationSec(job)}s</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {isRunning ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void cancelJob(job.id)}
                          leftIcon={<Square className="w-3 h-3 fill-current" />}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-xs font-mono tabular-nums">
                          {job.status === 'completed' ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Exit 0</span>
                            </span>
                          ) : job.status === 'cancelled' ? (
                            <span className="text-amber-400">Cancelled</span>
                          ) : (
                            <span className="text-red-400 flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Exit {job.exitCode ?? 1}</span>
                            </span>
                          )}
                        </span>
                      )}

                      {onSelectServer && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            onSelectServer(job.serverId);
                            onClose();
                          }}
                        >
                          View Terminal
                        </Button>
                      )}
                    </div>
                  </div>

                  {lastLine && (
                    <div className="mt-2.5 pt-2 border-t border-[#181C24] font-mono text-[11px] text-[#8A94A6] truncate">
                      <span className="text-[#5B6475] mr-1.5">&gt;</span>
                      <span>{lastLine}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
