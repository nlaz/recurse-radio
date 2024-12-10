import ollama from 'ollama'

export const generateChatMessage = async (radio) => {
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
}

export const generateBanter = async (radio) => {
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

  try {
    return JSON.parse(response.message.content);
  } catch (error) {
    console.error('Error parsing JSON:', error);
    return { script: [] };
  }
}
