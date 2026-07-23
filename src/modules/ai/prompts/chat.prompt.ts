export const buildChatPrompt = (context: string, userQuery: string): string => {
  return `
Context Information:
---------------------
${context}
---------------------

User Request: ${userQuery}
`;
};