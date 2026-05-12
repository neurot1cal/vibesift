// Cross-platform "open this file in the default browser" helper. Used by
// `vibesift propose` to land the user on the rendered HTML right after the
// session is created. Zero deps; best-effort: failures are silent, the
// caller still prints the file path so the user can open it manually.

import { spawn } from 'node:child_process';
import { platform } from 'node:process';

export function openInBrowser(filepath) {
  let cmd;
  let args;
  if (platform === 'darwin') {
    cmd = 'open';
    args = [filepath];
  } else if (platform === 'win32') {
    // start needs an empty title arg first because the first quoted token
    // is interpreted as the window title. Run it via cmd /c so we don't
    // need a shell-escaped string.
    cmd = 'cmd';
    args = ['/c', 'start', '', filepath];
  } else {
    cmd = 'xdg-open';
    args = [filepath];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    // Listen for spawn failure so it doesn't crash the parent process.
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
