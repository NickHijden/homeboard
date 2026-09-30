const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = process.cwd();
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

http.createServer((request, response) => {
  let requestPath = decodeURIComponent(request.url.split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';
  const filePath = path.join(root, requestPath);
  if (!filePath.startsWith(root)) {
    response.statusCode = 400;
    response.end('Bad request');
    return;
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }
    response.setHeader('Content-Type', mimeTypes[path.extname(filePath)] || 'application/octet-stream');
    response.end(contents);
  });
}).listen(4173, '0.0.0.0', () => {
  const localAddresses = Object.values(os.networkInterfaces()).flat().filter((entry) => entry && entry.family === 'IPv4' && !entry.internal);
  const localAddress = localAddresses.find((entry) => entry.address.startsWith('192.168.')) || localAddresses[0];
  console.log(`Homeboard preview: http://${localAddress?.address || '127.0.0.1'}:4173`);
});
