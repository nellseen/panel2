import React, { useState } from 'react';
import { Activity, Search, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { ActivityLog } from '../types';

interface ActivityLogsViewProps {
  activities: ActivityLog[];
  onRefresh: () => void;
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({ activities, onRefresh }) => {
  const [search, setSearch] = useState('');

  const filtered = activities.filter(
    (a) =>
      a.action.toLowerCase().includes(search.toLowerCase()) ||
      a.server_id.toLowerCase().includes(search.toLowerCase()) ||
      a.details.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <span>Activity Audit Log</span>
          </h2>
          <p className="text-xs text-slate-400">
            Immutable SQLite transaction record of system events, process lifecycles, and user actions
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold rounded-xl border border-white/[0.08]"
        >
          Refresh
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Filter by action, server ID, or details..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full glass-panel rounded-xl pl-10 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel p-12 text-center text-slate-500 rounded-2xl">
          No activity logs recorded yet.
        </div>
      ) : (
        <div className="glass-panel rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
          {filtered.map((log) => {
            const isSuccess = log.status === 'success';

            return (
              <div
                key={log.id}
                className="p-4 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {isSuccess ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200 text-xs">{log.action}</span>
                      {log.server_id && (
                        <span className="font-mono text-[11px] text-slate-400">
                          {log.server_id}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{log.details}</p>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-500 whitespace-nowrap shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
