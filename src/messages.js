const MAX_MESSAGES = 100;

export const messages = [
  {
    id: 1,
    type: "system",
    content: "Welcome to Recurse Radio!",
    timestamp: new Date().toLocaleTimeString()
  },
];

export const addToMessages = (content, { type = 'user', host = 'Ollie' }) => {
  const message = {
    id: Date.now(),
    type,
    host,
    content,
    timestamp: new Date().toLocaleTimeString()
  };

  messages.push(message);

  if (messages.length > MAX_MESSAGES) {
    messages.shift();
  }

  return message;
}
