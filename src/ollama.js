import ollama from 'ollama';

// Match pattern: Name: "dialogue" or Name: dialogue
const isDialogueFormat = input => input.split('\n').every((line) => {
  const trimmedLine = line.trim();
  if (trimmedLine === '') return true;

  return /^[A-Za-z]+\s*:\s*["']?.*["']?\s*$/.test(trimmedLine);
});

// Check for JSON-like format
const isJsonFormat = (input) => {
  const trimmed = input.trim();

  return /^\s*{\s*"?script"?\s*:\s*\[/.test(trimmed) || /^\s*{\s*script\s*:\s*\[/.test(trimmed);
};

// Add quotes around property names
const fixAndParseJson = (str) => {
  try {
    const fixedStr = str.replace(/(\w+):/g, '"$1":');
    return JSON.parse(fixedStr);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return null;
  }
};

const parseDialogue = (text) => {
  const lines = text.split('\n');
  const script = lines.map((line) => {
    const [host, ...rest] = line.split(':');
    const dialogue = rest.join(':').trim();
    const cleanLine = dialogue.replace(/^"|"$/g, '');

    return {
      host: host.trim(),
      line: cleanLine,
    };
  });

  return { script };
};

const tryParseJson = (text) => {
  try {
    return JSON.parse(response.message.content);
  } catch (error) {
    return fixAndParseJson(text);
  }
};

const parseScript = (text) => {
  if (isJsonFormat(text)) {
    return tryParseJson(text);
  } else if (isDialogueFormat(text)) {
    return parseDialogue(text);
  }
  return null;
};

export const generateChatMessage = async (radio) => {
  // prettier-ignore
  const response = await ollama.chat({
    model: 'llama3.2:1b',
    messages: [
      { role: 'system', content: 'You are a dj radio host named Harriet working for the Recurse Radio. You are concise, witty, and upbeat. '},
      { role: 'system', content: 'Context: Recurse Center is programmer retreat in New York focused on programming.' },
      { role: 'system', content: 'Context: The current track is ' + radio.currentTrack },
      { role: 'user', content: 'Provide some banter. Keep it concise and under 20 words.' }
    ],
  })

  console.log(response.message);

  return JSON.parse(response.message.content);
};

export const generateBanter = async (radio) => {
  // prettier-ignore
  const response = await ollama.chat({
    model: 'llama3.2:1b',
    messages: [
      { role: 'system', content: 'You are an AI assistant providing the script for two dj radio hosts named Harriet and Wolfgang working for the Recurse Radio. You are concise, witty, and upbeat.'},
      { role: 'system', content: 'Context: Recurse Center is programmer retreat in New York focused on programming.' },
      { role: 'system', content: 'Context: The current track is ' + radio.currentTrack },
      { role: 'system', content: 'Provide the response in the following JSON format: { script: [{ host: <host>, line: <line> }]}'},
      { role: 'user', content: 'Provide some banter between the two hosts. Keep it concise and under 30 words.' },
    ],
  })

  console.log(response.message.content);

  return parseScript(response.message.content);
};
