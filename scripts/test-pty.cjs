const { app } = require('electron');
const pty = require('node-pty');

app.on('ready', () => {
  try {
    const p = pty.spawn('/bin/zsh', ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: '/tmp',
      env: process.env
    });
    let buf = '';
    p.onData(d => { buf += d; });
    setTimeout(() => { p.write('echo PTY_OK_TEST\n'); }, 1000);
    setTimeout(() => {
      p.kill();
      if (buf.includes('PTY_OK_TEST')) {
        console.log('SUCCESS: PTY works in Electron');
      } else {
        console.log('FAIL: PTY spawned but no output. buf.length=' + buf.length);
        if (buf.length > 0) console.log('buf preview:', buf.slice(0, 200));
      }
      app.quit();
    }, 3000);
  } catch(e) {
    console.log('ERROR: PTY failed to spawn:', e.message);
    app.quit();
  }
});
