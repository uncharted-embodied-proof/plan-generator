import dotenv from "dotenv";
import express from "express";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import readline from 'readline';
import path from "path";
import { spawn } from 'child_process';


async function readJSONL(filePath, onObject) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue; // skip empty lines
    try {
      const obj = JSON.parse(line);
      await onObject(obj); // process each object
    } catch (err) {
      console.error('Invalid JSON line:', line);
    }
  }
}

async function readJSONLToArray(filePath) {
  const results = [];
  await readJSONL(filePath, (obj) => {
    results.push(obj);
  });
  return results;
}


dotenv.config();

// Read data
const world = JSON.parse(fs.readFileSync('./world.json', 'utf8'));
const plans = await readJSONLToArray('./plans.jsonl');

console.group('==== Data Stats ===');
console.log(`# state=${world.nodes.length}, # edges=${world.edges.length}`);
console.log(`# plans=${plans.length}`);
console.log('');
console.groupEnd();

const ANSWER_MAX = 2200;
let codeUseCount = 0;


const MODEL = "gemini-3.1-flash-lite-preview";
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
        You are an expert in javascript coding and json formats. Your job is to generate JS code to evaulate over the following JSON data structure.

        ## plans structure
        The summary section describes the plan's overall metrics, assuming that all legs of the trip are completed.

        The trip array describes details and running totals after completing each leg of the trip
        - trip[].leg describes the drone configuration for that leg
        - trip[].stats describes the intermediate stats after completing the leg

        [
          {
            "id": 90112,
            "summary": {
              /* The total time for the trip */
              "time": number,

              /* The total amount of energy used during the trip */
              "energy": number,

               /* The time when package is delivered */
              "deliveryTime": number,

              /* The percentage of energy left for the trip */
              "energyReserve": number,

              /* Margin of time error, positive values are good, negative values are bad */
              "deliveryTimeMargin": number,

              /* Safety metrics, these are normalized between 1 (good) and 0 (not good)  */
              "payloadDeliveryTimeSafety": number,
              "bloodIntegrity": number,
              "droneSafety": number,
              "dronePowerSafety": number,
              "droneBatterySafety": number,
              "routeSafety": number,
              "temperatureSafety": number,
              "ascentSafety": number,
              "windSafety": number,
              "payloadTemperatureDeviation": number,

              /* asset safety and patient survivial are important ranking metrics */
              "assetSafety": number,
              "patientSurvival": number,


              /* How many times (or percentage of times) a feature has been turned on */
              "totalTurbo": number,
              "totalAvoid": number,
              "totalCond": number,
              "totalComm": number,
              "percentTurbo": number,
              "percentAvoid": number,
              "percentCond": number,
              "percentComm": number,
              "difficulty": number
            },
            "trip": [
              {
                "leg": {
                  "comm": number, 0 or 1
                  "avoidance": number, 0 or 1
                  "turbo": number, 0 or 1
                  "cond": number, 0 or 1

                  "leg": string,
                  "distance": number,
                  "weather": string,
                  "difficulty": number,
                  "temperature": number,
                  "id": number
                },
                "stats": {
                  "travelTime": number,
                  "payloadTemperature": number,
                  "energyReserve": number,
                  "payloadTemperatureLoad": number,
                  "droneBatteryLoad": number,
                  "dronePowerLoad": number,
                  "droneWindLoad": number,
                  "droneTemperatureLoad": number,
                  "difficulty": number
                }
              },
              ...
            ]
          }
        ]


        example query:  
          For COA 2345, what is my energyReserve when I reach location Y?

        example code: 
          let plan = plans.find(p => p.id === 2345);
          let result = '';
          if (plan) {
            let waypoint = plan.trip.findLast(s => s.leg.leg[1] === 'Y');
            if (waypoint) { 
              result = waypoint;
            }
            result = "Cannot find location in the COA"
          } else {
            result = "plan not found"
          }
          result.stats.energyReserve;


        example query:
          How many COAs have energy reserve less than 0.5 when we reach Y

        example code:
          let cnt = 0
          
          for (const plan of plans) {
            const zoneStat = p.trip.findLast(s => s.leg.leg[1] === 'Y')
            if (zoneStat.stats.energyReserve < 0.5) {
              cnt ++;
            }
          }
          cnt;

        example query:
          Are there any COAs with patient safety > 0.5 and asset safety > 0.8

        example code:
          let matchingPlans = plans.filter(p => {
            return p.summary.patientSafety > 0.5 && p.summary.assetSafety >= 0.8;
          });
          let numMatchingPlans = matchingPlans.length;
          numMatchingPlans;
        
        General hints:
        - When the query asks for a quantitative or existential question, eg: "are there ...", "how many ...", "number of ...". Return the number of matches along with a short text summary.
        - When the query asks for details or configurations, return the full plan objects, the "plan" array should be converted to the world nodes that the element ids reference.
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
          ${JSON.stringify(evalResult).substring(0, ANSWER_MAX)}
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


app.get('/plans/:id', (req, res) => {
  const id = req.params.id || plans[0].id;
  const plan = plans.find(d => d.id === +id);
  res.send({ plan: plan});
});


app.post('/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).send({ error: 'Message is required' });
  }

  let iteration = 0;
  let responseText = '';

  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  console.log('');
  console.group(`>>> [${formatted}]`);
  console.log(`Query: ${message}`);

  const contents = [...history, { role: "user", parts: [{ text: message }] }];

  while (true) {
    iteration ++;
    const toolChoice = contents.some(c => c.role === 'tool') ? 'none' : 'auto';
    console.log(`Iteration: ${iteration}`);
    console.log(`Model: ${MODEL}`);
    console.log(`Tool choice: ${toolChoice}`);


    // old constraint
    // - abs(payloadTemperatureDeviation) should be 0

    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        config: {
          systemInstruction: `
            You are an expert navigator trained to help drone operators solve navigation problems.

            We are working with the following constraints, thus making the plans potentially invalid:
            - Any plans where energyReserve falls below 0.1
            - Any plans with negative deliveryTimeMargin
            - Any plans where bloodIntegrity falls below 0.8
            - Any plans where assetSafety falls below 0.8
            - Any plans where patientSurvival falls below 0.8
            - Any plans where totalAvoid falls below 4
            - Any plans where totalComm falls below 4


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


            General hints
            - The terms "plan" and "COA" are equivalent, if the operator is asking about COAs they are asking about plans

            - When the query asking time related questions, it is important to distinguish between deliveryTime and time. When the query is asking about target/destination, the time metric to be evaluated is usually "summary.deliveryTime"

            - If the operator asks about constraints, tradeoffs, and variables, answer the question directly, do not call a Tool. 

            - When a tool returns a response, interpret the result and provide the final answer to the user. Do not call another tool unless absolutely necessary.

            - For quantitative or existential queries, eg: "are there ...", "what is the number of ...", you should return the NUMBER of matching plans and not the plan objects


            Important 
            - For queries unrelated to plans, graphs, navigation, do not use any tools, just reply that the question is outside of your operating parameters.
            - Be concise in your answers unless otherwise noted.

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
      const status = err?.status || err?.response?.status || error?.error?.code;
      if (status) {
        if (status == 429 || status >= 500) {
          responseText = `Something bad happened (status = ${status} ) ... service is not available or reached a rate limitation`;
        } else {
          responseText = `Something bad happened, status code = ${status} `;
        }
      } else {
        responseText = 'Error in analytic execution, try rephraasing your query to be more exact';
      }

      break;
    }
  }
  console.groupEnd();
  res.send({ reply: responseText });
});

app.listen(port, () => {
  console.log('Starting server...');
  console.log(`Server listening at http://localhost:${port}`);
});
