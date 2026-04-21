import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import readline from 'readline';
import path from "path";


import pLimit from "p-limit";
import Bottleneck from "bottleneck";

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


function createPrompt(plan, styleHint) {
  const summary = plan.summary;
  const style = styleHint || 'Be very very creative';

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
    Reason over these summary metrics from a flight plan ${plan.id} to deliver supply to patient and fly back 
    to base, each metric is graded on a 6-level scale:

    Outstanding > Good > Borderline > Poor > Unacceptable

    - Patient Survival: ${goodScale(summary.patientSurvival)}
    - Asset Safety: ${goodScale(summary.assetSafety)}
    - Drone Safety: ${goodScale(summary.droneSafety)}
    - Route Safety: ${goodScale(summary.routeSafety)}
    - Ease of Navigation: ${diffScale(summary.difficult)}
    - Fuel usage: ${energyScale(summary.energyReserve)}
    - Delivery time: ${deliveryScale(summary.deliveryTime)}

    if Fuel usage is Unacceptable it will unlikely make it back to base

    Summarize above into a title for the flight, in 25 or fewer words. ${style}

    Do not apply markdown formatting
  `;

   /*
    Examples of good titles are:
    - Rapid Response: Critical Patient Delivery
    - High-Speed Life-Saving Mission
    - Patient Priority: Full Throttle Delivery
  */



  return prompt;

  /*
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents: prompt 
  });
  return response.text;
  console.log(`id=${plan.id}`, plan.summary);
  console.log(response.text);
  */
}


const limit = pLimit(10); // concurrency cap
const limiter = new Bottleneck({
  minTime: 150 // ~6–7 requests per second (1000ms / 150 ≈ 6.6)
});

async function callModel(prompt) {
  return limiter.schedule(() =>
    limit(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: prompt
      })
    )
  );
}

async function withRetry(fn, retries = 2) {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= retries) throw err;
      await new Promise(r => setTimeout(r, 500 * attempt)); // backoff
    }
  }
}


async function writeArrayToJSONL(filePath, dataArray) {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });

  for (const item of dataArray) {
    const jsonLine = JSON.stringify(item) + '\n';

    if (!stream.write(jsonLine)) {
      await new Promise(resolve => stream.once('drain', resolve));
    }
  }

  stream.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}



if (process.argv.length === 5) {
  const startIdx = +(process.argv[2]);
  const endIdx = +(process.argv[3]);
  const style = process.argv[4];
  const prompts = [];

  for (let i = startIdx; i <= endIdx; i++) {
    prompts.push(createPrompt(plans[i], style));
  }

  const total = prompts.length;
  let completed = 0;

  console.log(`Starting ${startIdx} to ${endIdx}:`);
  const results = await Promise.all(
    prompts.map(prompt =>
      withRetry(() => callModel(prompt)).then(res => {
        completed ++;
        if (completed % 10 === 0) {
          console.log(`Done ${completed} / ${total}`);
        }
        return res;
      })
    )
  );
  console.log(`Done ${completed} / total`);

  const output = [];
  let cnt = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const obj = {
      id: plans[i].id, 
      summary: results[cnt].text
    };
    output.push(obj);
    cnt ++;
  }
  await writeArrayToJSONL('./titles.jsonl', output);

} else if (process.argv.length === 4) {
  const index = +(process.argv[2]);
  const style = process.argv[3];
  const plan = plans[index];
  const prompt = createPrompt(plan, style);

  const start = Date.now();
  const results = await Promise.all([
    withRetry(() => callModel(prompt))
  ]);
  const end = Date.now();
  const title = results[0].text;

  console.log(`COA ${plan.id}`);
  console.log(plan.summary);
  console.log(`title=${title}`);
  console.log(`done in ${(end - start)}ms`);
} else {
  console.log(` 
  Usage:
    node ./s2.js <start> <end> [style]

    or

    node ./s2.js <planId> [style]
  `)
}
console.log('');
console.log('');



process.exit(0)



