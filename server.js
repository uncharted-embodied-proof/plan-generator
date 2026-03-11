import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

dotenv.config();

const world = JSON.parse(fs.readFileSync('./world.json', 'utf8'));
const plans = JSON.parse(fs.readFileSync('./plans.json', 'utf8'));

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static(path.resolve(process.cwd())));


/**
 * Tool delcaration
*/
const tools = [
  {
    functionDeclarations: [
      {
        name: "generate_search_code",
        description: "Generate code that can be evaluated and run to find facts about the graph/world and plans",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The question we want to ask about the world or plan",
            }
          },
          required: ["query"],
        },
      },
    ],
  },
];


/**
 * Generates JS-code that can be operated on world or plans data structures
**/
async function generateSearchCode(query) {
  const response = await ai.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction: `
        You are an expert in javascript coding and json formats. Your job is to generate JS code to evaulate over the following JSONs

        world.json looks like:

        {
          nodes: [ 
            { 
              id: number, 
              location: string,
              weather: good | bad,
              boost: 1 | 0, 
              comm: 1 | 0, 
              avoidance: 1 | 0,
              distance: number, 
              difficulty: number 
            }, ... 
          ],
          edges: [ { source, target }, ... ]
        }

        plans.json looks like, the plan array references the nodes in the world.json structure

        [
          {
            id: number,
            summary: {
              time: number,
              energy: number,
              difficulty: number
            },
            plan: [
              number, number, number, ...
            ]
          },
          ...
        ]
        

        The code should look for node objects in world.json if the question is about the world. 
        The code should look for plan objects in plans.json if the question is about flight plans/paths

        Assume you have global variables "world" and "plans' as specified above, return the javascript code
        The last line of the code should be the answer

        Return plain-text, not markdown

        Be concise in your answers unless otherwise noted.
      `,
      temperature: 0.4
    },
    contents: [{ role: "user", parts: [{ text: query }] }]
  });

  const toolResultText = response.text;
  return toolResultText;
}


async function runTool(name, args) {
  if (name === "generate_search_code") {
    const { query } = args;
    console.log('>> calling tool:', query);

    const toolResultText = await generateSearchCode(query);


    if (toolResultText) {
      // const fn = new Function(toolResultText + "; return Object.values(this).find(v => typeof v === 'function');")();
      const evalResult = eval(toolResultText);

      console.log('...........');
      console.log(toolResultText);
      console.log('');
      console.log(evalResult);
      console.log('');
      console.log('...........');
      console.log('');

      if (Array.isArray(evalResult)) {
        if (evalResult.length === 0) {
          console.log('!! no results found');
          return { answer: 'No results found' };
        }
      }
      return { 
        answer: `
          === Tool logic ===
          ${toolResultText}

          === Tool answer === 
          ${evalResult}
        `
      };
    }
    return { answer: 'Cannot process request, maybe rephrase the the query' };
  }
}


const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// const MODEL = "gemini-1.5-flash";
// const MODEL = "gemini-2.5-flash"; 
// const MODEL = "gemini-2.5-flash-lite";
const MODEL = "gemini-3.1-flash-lite-preview";

app.get('/', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'index.html'));
});

app.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).send({ error: 'Message is required' });
  }

  let responseText = '';


  const contents = [...history, { role: "user", parts: [{ text: message }] }];
  while (true) {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: {
        systemInstruction: `
          You are an expert navigator trained to help drone operators solve navigation problems.

          We are working with the following constraints:
          - Any plans that use more than 2000 energy units are potentially invalid
          - Any plans that use more than 120 time units are potentially invalid
          - Any plans with difficulty more than 100 units are potentially invalid


          When a tool returns a response, interpret the result and provide the final answer to the user. Do not call another tool unless absolutely necessary.

          Be concise in your answers unless otherwise noted.
        `,
        temperature: 0.5,
        tools: tools,
        tool_choice: contents.some(c => c.role === "tool") ? "none" : "auto"
      },
      contents: contents
    });
    responseText = response.text;
    console.log('debugging', responseText);

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const toolCall = parts.find(p => p.functionCall);
    if (toolCall) {
      const { name, args } = toolCall.functionCall;
      const result = await runTool(name, args);
      contents.push(candidate.content);

      contents.push({
        role: "tool",
        parts: [{
          functionResponse: {
            name,
            response: result
          }
        }]
      });
    } else {
      break;
    }
  }
  res.send({ reply: responseText });

  /*
  try {
    const text = response.text;
    res.send({ reply: text });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).send({ error: 'Failed to get response from AI' });
  }
  */
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
