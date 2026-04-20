import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import readline from 'readline';
import path from "path";

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
const plans = await readJSONLToArray('./plans.jsonl');
console.group('==== Data Stats ===');
console.log(`# plans=${plans.length}`);
console.log('');
console.groupEnd();


const E = process.env;
const ai = E.GEMINI_API_KEY ? 
  new GoogleGenAI({
    vertexai: false,
    apiKey: E.GEMINI_API_KEY,
  }) :
  new GoogleGenAI({
    vertexai: true,
    project: E.GOOGLE_CLOUD_PROJECT,
    location: E.GOOGLE_CLOUD_LOCATION
  });

async function listModels() {
  const models = await ai.models.list();

  for await (const model of models) {
    console.log(model.name);
  }
}


async function test(plan, style = 'Be very very creative.') {
  const summary = plan.summary;

  const goodScale = (value) => {
    if (value > 0.9) return 'Outstanding';
    if (value > 0.8) return 'Good';
    if (value > 0.6) return 'Borderline';
    if (value > 0.4) return 'Poor';
    if (value > 0.2) return 'Very Poor';
    return 'Unacceptable';
  };

  const diffScale = (value) => {
    if (value > 100) return 'Very Poor';
    if (value > 60) return 'Borderline';
    if (value > 10) return 'Good';
    return 'Outstanding';
  };

  const energyScale = (value) => {
    if (value > 0.4) return 'Outstanding';
    if (value > 0.2) return 'Good';
    if (value > 0.0) return 'Borderline';
    return 'Unacceptable';
  }

  const deliveryScale = (value) => {
    const anchor = 840;
    if (value > anchor + 240) return 'Unacceptable';
    if (value > anchor + 180) return 'Very Poor';
    if (value > anchor + 60) return 'Poor';
    if (value > anchor) return 'Borderline';
    if (value > anchor -60) return 'Good';
    return 'Outstanding';
  }

  const prompt = `
    Reason over these summary metrics from a flight plan ${plan.id}, each metric is graded on a 6-level scale:
    Outstanding > Good > Borderline > Poor > Unacceptable

    - Patient Survival: ${goodScale(summary.patientSurvival)}
    - Asset Safety: ${goodScale(summary.assetSafety)}
    - Drone Safety: ${goodScale(summary.droneSafety)}
    - Route Safety: ${goodScale(summary.routeSafety)}
    - Ease of Navigation: ${diffScale(summary.difficult)}
    - Fuel usage: ${energyScale(summary.energyReserve)}
    - Delivery time: ${deliveryScale(summary.deliveryTime)}

    Summarize above into a title for the flight, in 15 or fewer words. ${style}
    Examples of good titles are:
    - Rapid Response: Critical Patient Delivery
    - High-Speed Life-Saving Mission
    - Patient Priority: Full Throttle Delivery

    Do not apply markdown formatting
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt 
  });
  return response.text;
  console.log(`id=${plan.id}`, plan.summary);
  console.log(response.text);
}


const index = +(process.argv[2]);
const style = process.argv[3];

const plan = plans[index];

let title = '';
const start = Date.now();
if (!style) {
  console.log('default style');
  title = await test(plan);
} else {
  console.log(`custom style: ${style}`);
  title = await test(plan, style);
}
const end = Date.now();

console.log(`COA ${plan.id}`);
console.log(plan.summary);
console.log(`title=${title}`);
console.log(`done in ${(end - start)}ms`);
process.exit(0)



