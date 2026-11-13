const autocannon = require('autocannon');
const { spawn } = require('child_process');

const server = spawn('node', ['server/server.js'], { cwd: process.cwd(), stdio: 'inherit' });

setTimeout(() => {
  autocannon({
    url: 'http://localhost:3000',
    connections: 10,
    duration: 3,
    pipelining: 1,
    headers: {
      connection: 'keep-alive'
    }
  }, (err, result) => {
    if (err) {
      console.error(err);
      server.kill();
      process.exit(1);
    }

    console.log(`requests: ${result.requests.total}`);
    console.log(`latency p95: ${result.latency.p95}`);
    console.log(`2xx: ${result.statusCodeStats['2xx'] || 0}`);
    server.kill();
  });
}, 1500);
