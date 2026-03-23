import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { spawn } from 'child_process';

dotenv.config();

const world = JSON.parse(fs.readFileSync('./world.json', 'utf8'));
const plans = JSON.parse(fs.readFileSync('./plans.json', 'utf8'));


console.group('==== Data Stats ===');
console.log(`# state=${world.nodes.length}, # edges=${world.edges.length}`);
console.log(`# plans=${plans.length}`);
console.log('');
console.groupEnd();

let codeUseCount = 0;

// const MODEL = "gemini-1.5-flash";
// const MODEL = "gemini-2.5-flash"; 
// const MODEL = "gemini-2.5-flash-lite";
const MODEL = "gemini-3.1-flash-lite-preview";

// const CODE_MODEL = "gemini-2.5-flash-lite";
const CODE_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
];


const app = express();
const port = 8888;

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
        description: "Generate code that can be evaluated and run to find facts about the states, world, and plans",
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
  {
    functionDeclarations: [
      {
        name: "python_query",
        description: "Handles complicated graph analyics like traversals, spanning trees, neighbourhood search, pareto fronts and the like.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The question relating to graph properties",
            }
          },
          required: ["query"],
        },
      },
    ],
  }
];


/**
 * Generates JS-code that can be operated on world or plans data structures
**/
async function generateSearchCode(query) {
  codeUseCount ++;

  const response = await ai.models.generateContent({
    model: CODE_MODELS[codeUseCount % CODE_MODELS.length],
    config: {
      systemInstruction: `
        You are an expert in javascript coding and json formats. Your job is to generate JS code to evaulate over the following JSONs

        world.json looks like:
        - the elements in nodes represent possible configurations
        - the temperature here refer to the temperature at the lcation, not the payload temperature

        {
          nodes: [ 
            { 
              id: number, 
              location: string,
              weather: good | bad,
              turbo: 1 | 0, 
              comm: 1 | 0, 
              avoidance: 1 | 0,
              cond: 1 | 0,
              distance: number, 
              difficulty: number, 
              temperature: number,
            }, ... 
          ],
          edges: [ { source, target }, ... ]
        }

        plans.json looks like:
        - the plan array references the nodes in the world.json structure, 
        - the stats array is a cumulative state after each step in plan

        [
          {
            id: number,
            summary: {
              time: number,
              energy: number,
              difficulty: number,
              deliveryTime: number,
              deliveryTimeMargin: number,
              payloadDeliveryTimeSafety: number,
              bloodIntegrity: number,
              droneSafety: number,
              routeSafety: number,
              assetSafety: number,
              patientSurvival: number,
              energyReserve: number,
              payloadTemperatureDeviation: number,

              totalTurbo: number,
              totalAvoid: number,
              totalCond: number,
              totalComm: number
            },
            stats: [
              { travelTime: number, battery: number, payloadTemp: number },
              { travelTime: number, battery: number, payloadTemp: number },
              ...
            ],
            plan: [
              number, number, number, ...
            ]
          },
          ...
        ]



        The code should look for node objects in world.json if the question is about the world. 
        The code should look for plan objects in plans.json if the question is about flight plans/paths

        If the query is asking for a number, eg: "how many ...", "number of ...". Return a short summary.

        Important!! Do not return a list of objects unless explictedly asked to do so.

        When the query asking time related questions, it is important to distinguish between deliveryTime and time. When the query is asking about target/destination, the time metric to be evaluated is usually "summary.deliveryTime"

        
        When the query ask for details or configurations, return the full plan objects, the "plan" array should be converted to the world nodes that the element ids reference.

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


function runPython(query) {
  return new Promise((resolve, reject) => {
    const py = spawn("python", ["python-ai.py", query]);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("close", (code) => {
      if (code !== 0) return reject(stderr);
      resolve(stdout);
    });
  });
}


async function runTool(name, args) {
  if (name === "generate_search_code") {
    const { query } = args;
    console.log('>> calling JS tool:', query);

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
      console.log(`<< result: `, evalResult);

      return { 
        answer: `
          === Tool logic ===
          ${toolResultText}

          === Tool answer (Long answers may be cut off) === 
          ${JSON.stringify(evalResult).substring(0, 2500)}
        `
      };
    }
    return { answer: 'Cannot process request, maybe rephrase the the query' };
  } else if (name === "python_query") {
    const { query } = args;
    console.log('>> calling python tool:', query);
    const output = await runPython(query);
    return { 
      answer: `
        === Tool answer === 
        ${output}
      `
    };
  }
}


const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});



app.get('/', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'index.html'));
});

app.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).send({ error: 'Message is required' });
  }

  let iteration = 0;
  let responseText = '';

  console.log('');
  console.group('>> processing chat');
  console.log(`query: ${message}`);

  const contents = [...history, { role: "user", parts: [{ text: message }] }];

  while (true) {
    iteration ++;
    const toolChoice = contents.some(c => c.role === 'tool') ? 'none' : 'auto';
    console.log(`iteration: ${iteration}`);
    console.log(`tool choice: ${toolChoice}`);

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        config: {
          systemInstruction: `
            You are an expert navigator trained to help drone operators solve navigation problems.

            We are working with the following constraints, thus making the plans potentially invalid:
            - Any plans where energyReserve falls below 0.1
            - Any plans with negative deliveryTimeMargin
            - abs(payloadTemperatureDeviation) should be 0


            The plans are evaluated based on a hierarchial mental model want is deemed to be important for the mission, with the bottom tiers of 
            the mental model mapping back to the drone's physical states.

            The mental model is summarized below:
            - patientSafety depends on payloadSafety and payloadDeliveryTimeSafety
            - assetSafety depends on droneSafety and routeSafety
            - routeSafety depends on droneTemperatureLoad, droneWindLoad, and difficulty
            - droneSafety depends on droneBatteryLoad and dronePowerLoad
            - payloadSafety depends on payloadTemperatureLoad
            - payloadDeliveryTimeSafety depends on deliveryTime


            Note patientSurvival, assetSafety, routeSafety, droneSafety, bloodIntegrity are safety metrics with values between [0, 1], the higher the better. With payloadTemperatureDeviation the values closer to 0 are better.

            Key system relationships:
            - Increasing boost → increases speed and power consumption
            - Increasing wind → increases power unless mitigated by boost
            - Larger temperature difference → increases thermal cost and payload drift
            - Longer time → increases energy use → reduces battery
            - More aggressive terrain changes → increases difficulty
            - Conditioning → improves temperature stability but increases power
            - Dropping payload → reduces power and stops delivery time

            !! Important !!
            The terms "plan" and "COA" are equivalent, if the operator is asking about COAs they are asking about plans


            !! Important !!
            When a tool returns a response, interpret the result and provide the final answer to the user. 
            Do not call another tool unless absolutely necessary.

            If the user asked for a specific plan, eg: "show me plan x", and we have an object representation, just interpret it, do not use anotehr tool


            !! Important !!
            Do not interpret the query as "returning all plans", anything that require logic logical filtering should use the "generate_search_code" tool


            !! Important !!
            For queries unrelated to plans, graphs, navigation, do not use any tools, just reply that the question is outside of your operating parameters.


            Be concise in your answers unless otherwise noted.
          `,
          temperature: 0.5,
          tools: tools,
          tool_choice: toolChoice
        },
        contents: contents
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      const toolCall = parts.find(p => p.functionCall);
      if (toolCall) {
        const { name, args } = toolCall.functionCall;
        console.log('tool needed', name, args);
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
        console.log('no tools needed for query');
        responseText = response.text;
        break;
      }
    } catch (err) {
      console.log(`LLM errored out somewhere, ${err}`);
      responseText = 'Soemthing bad happened...we probably hit a rate limit';
      break;
    }
  }
  console.groupEnd();
  res.send({ reply: responseText });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
