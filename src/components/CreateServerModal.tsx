import React, { useState } from 'react';
import { GitBranch, Layers, Play } from 'lucide-react';
import { AutoRestartPolicy, CreateServerPayload, ServerTemplateId } from '../types';
import { cloneGitRepo } from '../services/api';
import {
  Alert,
  Button,
  Checkbox,
  CodeText,
  Input,
  Modal,
  RadioGroup,
  Select,
  Tabs,
  Textarea,
} from './ui';
import {
  validateEntryFile,
  validateGitBranch,
  validateGitRepoUrl,
  validatePort,
  validateServerName,
} from '../utils/validation';
import { normalizeError } from '../utils/errors';

export interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: CreateServerPayload) => Promise<void>;
  onServerCreated: (serverId: string) => void;
}

type CreateMode = 'template' | 'git';

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onServerCreated,
}) => {
  const [mode, setMode] = useState<CreateMode>('template');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Template fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [port, setPort] = useState('3001');
  const [entryFile, setEntryFile] = useState('index.js');
  const [template, setTemplate] = useState<ServerTemplateId>('express_api');
  const [autoRestart, setAutoRestart] = useState<AutoRestartPolicy>('on-failure');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Git fields
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [gitName, setGitName] = useState('');
  const [autoInstall, setAutoInstall] = useState(true);
  const [gitLogs, setGitLogs] = useState('');
  const userEditedGitNameRef = React.useRef(false);

  const resetAndClose = React.useCallback(() => {
    if (loading) return;
    setFormError(null);
    setFieldErrors({});
    setGitLogs('');
    onClose();
  }, [loading, onClose]);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    const nameErr = validateServerName(name);
    if (nameErr) errs.name = nameErr;

    const portErr = validatePort(port);
    if (portErr) errs.port = portErr;

    const entryErr = validateEntryFile(entryFile);
    if (entryErr) errs.entry = entryErr;

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      setLoading(true);
      setFormError(null);
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        port: Number(port),
        template,
        auto_restart: autoRestart,
        entry_file: entryFile.trim() || 'index.js',
      });
      setName('');
      setDescription('');
      setFieldErrors({});
      onClose();
    } catch (err: unknown) {
      setFormError(normalizeError(err, 'Failed to create server').message);
    } finally {
      setLoading(false);
    }
  };

  const handleGitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    const urlErr = validateGitRepoUrl(repoUrl);
    if (urlErr) errs.repoUrl = urlErr;

    const branchErr = validateGitBranch(branch);
    if (branchErr) errs.branch = branchErr;

    if (gitName.trim()) {
      const nameErr = validateServerName(gitName);
      if (nameErr) errs.gitName = nameErr;
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    try {
      setLoading(true);
      setFormError(null);
      setGitLogs('[nodepanel] Cloning repository into isolated workspace...\n');

      const res = await cloneGitRepo({
        repo_url: repoUrl.trim(),
        branch: branch.trim() || undefined,
        name: gitName.trim() || undefined,
        auto_install: autoInstall,
      });

      setGitLogs((prev) => prev + (res.output || 'Clone complete.\n'));
      setRepoUrl('');
      setBranch('');
      setGitName('');
      onServerCreated(res.server.id);
      onClose();
    } catch (err: unknown) {
      setFormError(normalizeError(err, 'Git clone failed').message);
    } finally {
      setLoading(false);
    }
  };

  const formId = mode === 'template' ? 'create-template-form' : 'create-git-form';

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="Create Node.js Instance"
      description="Provision an isolated Node.js workspace supervised with POSIX process-group lifecycle controls."
      size="md"
      preventClose={loading}
      footer={
        <>
          <Button variant="ghost" size="md" onClick={resetAndClose} disabled={loading}>
            Cancel
          </Button>
          {mode === 'template' ? (
            <Button
              type="submit"
              form={formId}
              variant="primary"
              size="md"
              loading={loading}
              leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
            >
              Create Server
            </Button>
          ) : (
            <Button
              type="submit"
              form={formId}
              variant="primary"
              size="md"
              loading={loading}
              leftIcon={<GitBranch className="w-3.5 h-3.5" />}
            >
              Clone &amp; Create
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Tabs<CreateMode>
          fullWidth
          ariaLabel="Instance provisioning method"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setFormError(null);
            setFieldErrors({});
          }}
          items={[
            { id: 'template', label: 'Starter Template', icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'git', label: 'Git Repository', icon: <GitBranch className="w-3.5 h-3.5" /> },
          ]}
        />

        {formError && <Alert variant="error">{formError}</Alert>}

        {mode === 'template' ? (
          <form id={formId} onSubmit={handleCreateTemplate} noValidate className="space-y-4">
            <Input
              id="create-server-name"
              label="Server Name"
              required
              placeholder="e.g. Webhook Gateway API"
              value={name}
              error={fieldErrors.name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: '' }));
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                id="create-server-port"
                label="Listening Port"
                type="number"
                min={1024}
                max={65535}
                mono
                value={port}
                error={fieldErrors.port}
                onChange={(e) => {
                  setPort(e.target.value);
                  if (fieldErrors.port) setFieldErrors((p) => ({ ...p, port: '' }));
                }}
              />

              <Select
                id="create-server-autorestart"
                label="Auto-Restart Policy"
                value={autoRestart}
                onChange={(e) => setAutoRestart(e.target.value as AutoRestartPolicy)}
                options={[
                  { value: 'never', label: 'Never (Manual)' },
                  { value: 'on-failure', label: 'On-Failure (Max 5 retries)' },
                  { value: 'always', label: 'Always (Bounded)' },
                ]}
              />
            </div>

            <RadioGroup<ServerTemplateId>
              label="Starter Architecture"
              name="server-template"
              value={template}
              onChange={setTemplate}
              options={[
                {
                  value: 'express_api',
                  label: 'Express REST API',
                  description: 'JSON service with /api/ping health endpoint.',
                },
                {
                  value: 'basic_http',
                  label: 'Native HTTP Server',
                  description: 'Zero-dependency Node.js http server.',
                },
                {
                  value: 'background_worker',
                  label: 'Background Worker',
                  description: 'Periodic worker with graceful SIGTERM cleanup.',
                },
                {
                  value: 'blank',
                  label: 'Minimal Skeleton',
                  description: 'Clean package.json, .env, and index.js.',
                },
              ]}
            />

            <Input
              id="create-server-entry"
              label="Entry Command / File"
              mono
              value={entryFile}
              error={fieldErrors.entry}
              description="Relative file (e.g. index.js) or npm start / npm run <script>."
              onChange={(e) => {
                setEntryFile(e.target.value);
                if (fieldErrors.entry) setFieldErrors((p) => ({ ...p, entry: '' }));
              }}
            />

            <Textarea
              id="create-server-description"
              label="Description"
              rows={2}
              placeholder="Optional notes about service purpose or upstream dependencies..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </form>
        ) : (
          <form id={formId} onSubmit={handleGitClone} noValidate className="space-y-4">
            <Input
              id="create-git-repo-url"
              label="Git Repository URL"
              required
              mono
              placeholder="https://github.com/org/service.git"
              value={repoUrl}
              error={fieldErrors.repoUrl}
              onChange={(e) => {
                const val = e.target.value;
                setRepoUrl(val);
                if (fieldErrors.repoUrl) setFieldErrors((p) => ({ ...p, repoUrl: '' }));
                if (!userEditedGitNameRef.current && val) {
                  const segments = val.split('/').filter(Boolean);
                  const last = segments[segments.length - 1];
                  if (last) {
                    const derived = last.replace(/\.git$/i, '').trim();
                    if (derived && !derived.includes(':') && derived !== 'github.com' && derived !== 'gitlab.com') {
                      setGitName(derived);
                    }
                  }
                }
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                id="create-git-instance-name"
                label="Instance Name"
                placeholder="Defaults to repository name"
                value={gitName}
                error={fieldErrors.gitName}
                onChange={(e) => {
                  userEditedGitNameRef.current = true;
                  setGitName(e.target.value);
                  if (fieldErrors.gitName) setFieldErrors((p) => ({ ...p, gitName: '' }));
                }}
              />

              <Input
                id="create-git-branch"
                label="Branch"
                mono
                placeholder="main"
                value={branch}
                error={fieldErrors.branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  if (fieldErrors.branch) setFieldErrors((p) => ({ ...p, branch: '' }));
                }}
              />
            </div>

            <Checkbox
              checked={autoInstall}
              onChange={(e) => setAutoInstall(e.target.checked)}
              label={
                <span>
                  Run <CodeText>npm install</CodeText> automatically when package.json is present
                </span>
              }
              description="Uses non-blocking child execution inside the isolated workspace."
            />

            {gitLogs && (
              <pre className="rounded-lg bg-[#090B0E] border border-[#1F242D] p-3 font-mono text-[11px] text-[#D0D7E2] max-h-36 overflow-y-auto whitespace-pre-wrap">
                {gitLogs}
              </pre>
            )}
          </form>
        )}
      </div>
    </Modal>
  );
};
