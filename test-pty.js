import pty from 'node-pty'

console.log('Testing node-pty spawn...')
try {
  const proc = pty.spawn('/bin/bash', [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: '/',
    env: process.env
  })

  proc.onData(data => console.log('DATA:', data))
  proc.write('ls\r')
  
  setTimeout(() => {
    proc.kill()
    console.log('SUCCESS')
    process.exit(0)
  }, 1000)
} catch (e) {
  console.error('FAILED TO SPAWN', e)
  process.exit(1)
}
