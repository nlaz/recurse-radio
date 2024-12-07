import polka from 'polka';
import path from 'path';
import parser from 'body-parser';
import ejs from 'polka-ejs';
import Radio from './radio.js';

let radio;

const dir = path.join(__dirname, '..', 'public');
const serve = require('serve-static')(dir);
const port = process.env.NODE_ENV === 'production' ? 80 : 3000;

const server = polka()
  .use(serve)
  .use(parser.json())
  .use(ejs({ ext: "html" }));

server.get("/", (req, res) => {
  res.render("index");
});

server.get('/admin', (req, res) => {
  res.render('admin');
});

server.get('/info', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    currentTrack: radio.currentTrack,
    listeners: radio.listeners(),
  }));
});

server.post('/next', (req, res) => {
  console.log('Calling next track...');
  radio.next();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    currentTrack: radio.currentTrack,
    listeners: radio.listeners(),
  }));
});

server.post('/trigger', (req, res) => {
  console.log('Triggering voice process...');
  const { message, model } = req.body;
  radio.triggerVoiceProcess(message, model);

  res.writeHead(200);
  res.end('Triggered');
});

server.get('/radio', (req, res) => {
  const { id, passthrough } = radio.subscribe();

  req.on('close', () => radio.unsubscribe(id));

  res.writeHead(200, {
    'Access-Control-Allow-Methods': 'GET, OPTIONS, HEAD',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Transfer-Encoding': 'chunked',
    'Content-Type': 'audio/mpeg',
  });

  passthrough.on('data', (chunk) => {
    res.write(chunk);
  });

  passthrough.on('end', () => {
    res.end();
  });
});

server.listen(port, (err) => {
  if (err) throw err;
  radio = new Radio();
  console.log(`Server running on http://localhost:${port}`);
});
