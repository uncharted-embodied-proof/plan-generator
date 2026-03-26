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
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
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
  // {
  //   functionDeclarations: [
  //     {
  //       name: "python_query",
  //       description: "Handles complicated graph analyics like traversals, spanning trees, neighbourhood search, pareto fronts and the like.",
  //       parameters: {
  //         type: "object",
  //         properties: {
  //           query: {
  //             type: "string",
  //             description: "The question relating to graph properties",
  //           }
  //         },
  //         required: ["query"],
  //       },
  //     },
  //   ],
  // }
];


/**
 * Generates JS-code that can be operated on world or plans data structures
**/
async function generateSearchCode(query) {
  codeUseCount ++;

  const codeModel = CODE_MODELS[codeUseCount % CODE_MODELS.length];
  console.log(`generateSearchCode Model: ${codeModel}`);

  const response = await ai.models.generateContent({
    model: codeModel,
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
              leg: string,
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
              { leg: string, travelTime: number, energyReserve: number, payloadTemperature: number },
              { leg: string, travelTime: number, energyReserve: number, payloadTemperature: number },
              ...
            ],
            plan: [
              number, number, number, ...
            ]
          },
          ...
        ]


        The plan array references the nodes in the world.json structure, 

        The stats array contains up-to-date summary metrics at a given step, for example if we want to see how much energy is left or what is the payload temperature when we reached location X, we would check the last occurrence of X in the stats array, and check if the field values satisfiy our criteria. For example:

        example query:  
          For COA 2345, what is my energyReserve when I reach location Y?

        example code: 
          let plan = plans.find(p => p.id === 2345);
          let result = '';
          if (plan) {
            let waypoint = plan.stats.findLast(s => s.leg[1] === 'Y');
            if (waypoint) { 
              result = waypoint;
            }
            result = "Cannot find location in the COA"
          } else {
            result = "plan not found"
          }
          result;


        example query:
          How many COAs have energy reserve less than 0.5 when we reach Y

        example code:
          let cnt = 0
          
          for (const plan of plans) {
            const zoneStat = p.stats.findLast(s => s.leg[1] === 'Y')
            if (zoneStat.energyReserve < 0.5) {
              cnt ++;
            }
          }
          cnt;
          
        

        The code should look for node objects in world.json if the question is about the world. 
        The code should look for plan objects in plans.json if the question is about flight plans/paths


        General hints:
        When the query asks for a number, eg: "how many ...", "number of ...". Return a short text summary.

        

        - When the query asking time related questions, it is important to distinguish between deliveryTime and time. When the query is asking about target/destination, the time metric to be evaluated is usually "summary.deliveryTime"
        - When the query ask for details or configurations, return the full plan objects, the "plan" array should be converted to the world nodes that the element ids reference.
        - Do not return a list of objects unless explictedly asked to do so.


        Important:
        - Assume you have global variables "world" and "plans' as specified above, return the javascript code
        - The last line of the code should be the answer
        - Return in plain-text format, not markdown
        - Be concise in your answers unless otherwise noted.
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

    console.log('generated', toolResultText);


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
  console.group(`>> [${new Date()}] processing chat`);
  console.log(`query: ${message}`);

  const contents = [...history, { role: "user", parts: [{ text: message }] }];

  while (true) {
    iteration ++;
    const toolChoice = contents.some(c => c.role === 'tool') ? 'none' : 'auto';
    console.log(`iteration: ${iteration}`);
    console.log(`model: ${MODEL}`);
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


            The plans are based on a domain specific mental model. The model outlines the how to think about the situation at hand, from high level goal oriented concepts, ddwn to the physical states. You think kind of think of this as an edge list.

            The format is: <Dependent>,<Dependency>,<weight>

                patientSurvival,bloodIntegrity,50
                patientSurvival,payloadDeliveryTimeSafety,50
                time,travelTime,100
                energy,E,100
                assetSafety,droneBatterySafety,25
                assetSafety,dronePowerSafety,25
                assetSafety,temperatureSafety,17
                assetSafety,windSafety,17
                assetSafety,ascentSafety,16
                bloodIntegrity,payloadTemperatureLoad,50
                payloadDeliveryTimeSafety,deliveryTime,40
                payloadDeliveryTimeSafety,t_payload_max,10
                droneBatterySafety,battery,25
                dronePowerSafety,dronePowerLoad,25
                temperatureSafety,droneTemperatureLoad,17
                windSafety,droneWindLoad,17
                ascentSafety,difficulty,16
                battery,E,13
                battery,E_full,12
                dronePowerLoad,P,13
                dronePowerLoad,P_max,12
                droneTemperatureLoad,travelTime,6
                droneTemperatureLoad,T_max,6
                droneTemperatureLoad,T_min,5
                droneWindLoad,v_wind_zone,9
                droneWindLoad,v_wind_max,8
                difficulty,D_zone,6
                difficulty,travelTime,5
                difficulty,v_ascent_max,5
                payloadTemperatureLoad,temperature,50
                temperature,payloadTemperatureDeviation,25
                temperature,f_cond,25
                payloadTemperatureDeviation,travelTime,5
                payloadTemperatureDeviation,c_cond,5
                payloadTemperatureDeviation,travelTime,5
                payloadTemperatureDeviation,c_payload,5
                payloadTemperatureDeviation,m_payload,5
                E,P,55
                E,travelTime,45
                deliveryTime,travelTime,40
                travelTime,D_zone,80
                travelTime,v_base,38
                travelTime,v_turbo,38
                travelTime,f_turbo,34
                P,P_base,20
                P,f_payload,14
                P,f_turbo,10
                P,v_wind_zone,8
                P,f_cond,6
                P,f_comm,4
                P,f_avoid,4
                P,c_cond,2
                totalTurbo,f_turbo,1
                totalAvoid,f_avoid,1
                totalCond,f_cond,1
                totalComm,f_comm,1
                percentTurbo,f_turbo,1
                percentAvoid,f_avoid,1
                percentCond,f_cond,1
                percentComm,f_comm,1


            The variables that the operator can control are:
            - f_turbo
            - f_avoid
            - f_comm
            - f_cond

            
            For ranking plans, look at patientSurvival and assetSafety as the most important indicators. Here the higher the value the more desirable this plan is. Note this is a desirability of the plan, not an indication of whether the plan is valid or not.


            !! Important !!
            If the operator asks about constraints, tradeoffs, and variables, answer the question directly, do not call a Tool. 

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
