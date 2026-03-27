import fs from 'fs';
import _ from 'lodash';

// Return the world states in a given plan
function getPlanStates(p, nodes) {
  return p.plan.map(stateId => nodes.find(n => n.id === stateId));
}

// Print out the plan (eg: a list of world states)
function printPlan(plan, nodes) {
  for (const state of getPlanStates(plan, nodes)) {
    console.log( Object.entries(state).map(([k, v]) => `${k}=${v}`).join(', '))
  }
}

function cartesianObject(obj) {
  const keys = Object.keys(obj);

  return keys.reduce((acc, key) => {
    const values = obj[key];

    return acc.flatMap(combination =>
      values.map(value => ({
        ...combination,
        [key]: value
      }))
    );
  }, [{}]);
}


////////////////////////////////////////////////////////////////////////////////
// World specification
////////////////////////////////////////////////////////////////////////////////
const NUM_STEPS = 4;

const model = {
  comm: [1, 0],
  avoidance: [1, 0],
  turbo: [1, 0],
  cond: [1, 0],
};


const waypoints = ['X', 'A', 'B', 'C', 'D', 'Y'];
const legs = [
  // first half
  {
    leg: 'XA', 
    distance: 17000,
    weather: 'good',
    difficulty: 29,
    temperature: 83
  },
  {
    leg: 'XB', 
    distance: 10000,
    weather: 'bad',
    difficulty: 281,
    temperature: 30
  },
  {
    leg: 'XC',
    distance: 10000,
    weather: 'good',
    difficulty: 763,
    temperature: 5.0 
  },
  {
    leg: 'XD', 
    distance: 12000,
    weather: 'good',
    difficulty: 1302,
    temperature: 8.0
  },

  // second half
  {
    leg: 'AY',
    distance: 8400,
    weather: 'good',
    difficulty: 1480,
    temperature: 18 
  },
  {
    leg: 'BY',
    distance: 8000,
    weather: 'bad',
    difficulty: 1282,
    temperature: 50
  },
  {
    leg: 'CY',
    distance: 11000,
    weather: 'good',
    difficulty: 800,
    temperature: 5.0
  },
  {
    leg: 'DY',
    distance: 7000,
    weather: 'good',
    difficulty: 261,
    temperature: 8
  }
];

// Give some constraints so the world so it isn't a K-graph
// and a combinatorial explosion
function getNextLocations(v) {
  if (v === 'X') return ['A', 'B', 'C', 'D'];
  if (v === 'Y') return ['A', 'B', 'C', 'D'];
  if (v === 'A') return ['Y', 'X'];
  if (v === 'B') return ['Y', 'X'];
  if (v === 'C') return ['Y', 'X'];
  if (v === 'D') return ['Y', 'X'];
}



function neighbourNodes(locationId, worldStates) {
  const nextLocations = getNextLocations(locationId);

  return worldStates.filter(s => nextLocations.includes(s.location));
}


let worldStates = [];
let worldEdges = [];
let cnt = 0;

waypoints.forEach(w => {
  worldStates.push({
    location: w,
    id: ++cnt
  });
});

worldStates.forEach(s => {
  const permutations = cartesianObject(model);

  neighbourNodes(s.location, worldStates).forEach(s2 => {
    worldEdges.push({
      source: s.id,
      target: s2.id
    });
  });
});


const world = { nodes: worldStates, edges: worldEdges };


const starts = world.nodes.filter(n => n.location === 'X').map(n => n.id);
const goals = world.nodes.filter(n => n.location === 'Y').map(n => n.id);

console.log('world nodes ', world.nodes.length);
console.log('world edges', world.edges.length);
console.log('start', starts);
console.log('goals', goals);
console.log(world);


////////////////////////////////////////////////////////////////////////////////
// Generate possible states
// A plan is state-tupes across all times
////////////////////////////////////////////////////////////////////////////////
function traverseGraph(world, startId, k) {
  const { nodes, edges } = world;

  // Build adjacency list
  const adj = new Map();
  for (const node of nodes) {
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    if (adj.has(edge.source)) {
      adj.get(edge.source).push(edge.target);
    }
  }

  const results = [];

  function dfs(current, depth, visitCount, path) {
    // Track visit
    visitCount.set(current, (visitCount.get(current) || 0) + 1);
    path.push(current);

    // Stop if we ended up where we started
    if (starts.includes(current) && depth > 0) {
      results.push([...path]);

      // Backtrack
      path.pop();
      visitCount.set(current, visitCount.get(current) - 1);
      return;
    }

    // Save current path (optional: remove if you only want full depth paths)
    // results.push([...path]);
    if (depth < k) {
      const neighbors = adj.get(current) || [];

      for (const next of neighbors) {
        const count = visitCount.get(next) || 0;

        // Allow at most 2 visits per node
        if (count < 2) {
          dfs(next, depth + 1, visitCount, path);
        }
      }
    }

    // if (depth === k) {
    //   results.push([...path]);
    // }

    // Backtrack
    path.pop();
    visitCount.set(current, visitCount.get(current) - 1);
  }

  dfs(startId, 0, new Map(), []);
  return results;
}

let rawPlans = [];
starts.forEach(sid => {
  const p = traverseGraph(world, sid, NUM_STEPS);
  rawPlans = rawPlans.concat(p);
});
console.log('# raw plans', rawPlans.length);



////////////////////////////////////////////////////////////////////////////////
// Prune irrelevant plans to make results smaller
//
// - 1. Only have plans that actually reached goals
// - 2. Only those that have made it back to start? 
//
////////////////////////////////////////////////////////////////////////////////

let rawPlansThatReachedGoal = []
rawPlansThatReachedGoal = rawPlans.filter(plan => {
  return _.intersection(plan, goals).length === 1
    && starts.includes(_.last(plan));
});
console.log('# pruned plans (reach goal and home)', rawPlansThatReachedGoal.length);
console.log('# pruned plans (reach goal and home)', rawPlansThatReachedGoal);



const worldLegs = [];
let legcnt = 0;
for (const leg of legs) {
  const permutations = cartesianObject(model);
  for (const p of permutations) {
    worldLegs.push({
      ...p,
      ...leg,
      id: legcnt
    });
    legcnt ++;
  }
}
const worldLegsMap = new Map(worldLegs.map(n => [n.id, n]));




const findLoc = (id) => world.nodes.find(n => n.id === id).location;
const expandedPlans = [];



for (const plan of rawPlansThatReachedGoal) {
  // Step 1: Generate all leg keys and reverse keys
  const legGroups = [];
  for (let i = 0; i < plan.length - 1; i++) {
    const key = `${findLoc(plan[i])}${findLoc(plan[i + 1])}`;
    const keyR = `${findLoc(plan[i + 1])}${findLoc(plan[i])}`;
    // Step 2: Filter matching legs from worldLegs
    const legs = worldLegs.filter(l => l.leg === key || l.leg === keyR);
    legGroups.push(legs);
  }

  // Step 3: Generate all combinations of legs
  function cartesianProduct(arrays, prefix = []) {
    if (!arrays.length) {
      expandedPlans.push(prefix);
      return;
    }
    const [first, ...rest] = arrays;
    for (const item of first) {
      cartesianProduct(rest, [...prefix, item.id]);
    }
  }
  cartesianProduct(legGroups);
}



// for (const plan of rawPlansThatReachedGoal) {
//   const key1 = `${findLoc(plan[0])}${findLoc(plan[1])}`;
//   const key2 = `${findLoc(plan[1])}${findLoc(plan[2])}`;
//   const key3 = `${findLoc(plan[2])}${findLoc(plan[3])}`;
//   const key4 = `${findLoc(plan[3])}${findLoc(plan[4])}`;
// 
//   const key1r = `${findLoc(plan[1])}${findLoc(plan[0])}`;
//   const key2r = `${findLoc(plan[2])}${findLoc(plan[1])}`;
//   const key3r = `${findLoc(plan[3])}${findLoc(plan[2])}`;
//   const key4r = `${findLoc(plan[4])}${findLoc(plan[3])}`;
// 
//   const legs1 = worldLegs.filter(l => l.leg === key1 || l.leg === key1r); 
//   const legs2 = worldLegs.filter(l => l.leg === key2 || l.leg === key2r); 
//   const legs3 = worldLegs.filter(l => l.leg === key3 || l.leg === key3r); 
//   const legs4 = worldLegs.filter(l => l.leg === key4 || l.leg === key4r); 
// 
// 
//   for (const a of legs1) {
//     for (const b of legs2) {
//       for (const c of legs3) {
//         for (const d of legs4) {
//           expandedPlans.push([a.id, b.id, c.id, d.id]);
//         }
//       }
//     }
//   }
// }

console.log(expandedPlans.length);
console.log(expandedPlans[0]);


/* Score the plans with user criteria */
const P_base = 1000;
const P_boost = 200;
const P_payload = 1000;
const P_comms = 8;
const P_avoid = 20;
const P_weather = 237;
const P_max = 6635;

const T_max = 40;
const T_min = -10;
const c_cond = 0.2;
const c_payload = 4200;
const v_base = 10.0;

const v_boost = 24.0; // originally 18.0
const v_ascent_max = 5.0;
const v_wind_max = 8.0;

const E_full = 780;
const E_empty = 0;

const p_preserve = 10;
const m_payload = 1.5;

const T_payload_mid = 4.0;
const T_payload_max = 6.0;
const T_payload_min = 2.0;


const t_payload_max = 14 * 60;



const SAFETYFUNC = (values, times, totalTime) => {
  let weightedV = 0;
  for (let i = 0; i < values.length; i++) {
    const expV = (Math.exp(values[i]) - 1) / (Math.exp(1) - 1);
    weightedV += expV * (times[i] / totalTime)
  }
  return Math.max(0, 1 - weightedV);
}


const plans = expandedPlans.map((p, i) => {
  let totalDifficulty = 0;
  let totalEnergy = 0;
  let totalTime = 0;
  let deliveryTime = 0;

  let dropped = false;
  let currentTemperature = T_payload_mid;
  let trip = [];

  let totalComm = 0;
  let totalAvoid = 0;
  let totalCond = 0;
  let totalTurbo = 0;

  // for (const pid of p) {
  for (let i = 0; i < p.length; i++) {
    const pid = p[i];

    const ws = worldLegsMap.get(pid);
    const prevWs = i === 0 ? ws : worldLegsMap.get(p[i-1]);

    const v_wind_zone = (ws.weather === 'good' ? 0.3 : 7.0);
    const f_turbo = ws.turbo;
    const f_comms = ws.comm;
    const f_avoid = ws.avoidance;
    const f_cond = ws.cond;
    const f_payload = dropped === true ? 0 : 1;
    const T_zone = ws.temperature;

    totalTurbo += f_turbo;
    totalAvoid += f_avoid;
    totalCond += f_cond;
    totalComm += f_comms;


    const travelTime = ws.distance / ((1 - ws.turbo) * v_base + ws.turbo * v_boost);

    const powerConsumption = (
      P_base +
      P_weather * (v_wind_zone / v_wind_max) * (1 - f_turbo) +
      P_boost * f_turbo + 
      P_payload * f_payload +
      P_comms * f_comms + 
      P_avoid * f_avoid +
      c_cond * (T_zone - currentTemperature) * f_cond
    );

    const energyConsumption = powerConsumption * travelTime / 3600;

    const batteryLevel = (E_full - energyConsumption); 

    const droneTemperatureLoad = (T_zone - 0.5 * (T_max + T_min)) / (0.5 * (T_max - T_min));

    const dronePowerLoad = powerConsumption / P_max;

    const droneBatteryLoad = batteryLevel / E_full;

    const droneWindLoad = v_wind_zone / v_wind_max;

    const v_ascent = Math.abs(ws.difficulty - prevWs.difficulty) / travelTime;
    const difficulty = (v_ascent / v_ascent_max) * (1 - f_avoid);


    const deltaPayloadTemp = (ws.temperature - currentTemperature) * c_cond * travelTime / (c_payload * m_payload)
    currentTemperature = (1 - f_cond) * deltaPayloadTemp + currentTemperature;


    const payloadTemperatureLoad = (currentTemperature - T_payload_mid) / (0.5 * (T_payload_max - T_payload_min))

    // Calculation all done, settle up
    deliveryTime += (travelTime * f_payload);
    totalTime += travelTime;
    totalEnergy += energyConsumption;
    totalDifficulty += difficulty;

    /**
     * b - battery remaining
     * t - payload temperature
    */
    trip.push({
      leg: ws,

      stats: {
        travelTime: +travelTime.toFixed(2),
        payloadTemperature: dropped ? null : +currentTemperature.toFixed(2),
        energyReserve: +((E_full - totalEnergy) / E_full).toFixed(2),

        payloadTemperatureLoad: +payloadTemperatureLoad.toFixed(2),
        droneBatteryLoad: +droneBatteryLoad.toFixed(2),
        dronePowerLoad: +dronePowerLoad.toFixed(2),
        droneWindLoad: +droneWindLoad.toFixed(2),
        droneTemperatureLoad: +droneTemperatureLoad.toFixed(2),
        difficulty: +difficulty.toFixed(2),
      }
    });

    //  Finall compute if we completed the delivery
    // console.log('!!!', goals);
    // if (goals.includes(pid)) {
    if (ws.leg[1] === 'Y') {
      dropped = true;
    }
  }

  const zoneTimes = trip.map(d => d.stats.travelTime);
  const payloadSafety = SAFETYFUNC(trip.map(d => d.stats.payloadTemperatureLoad), zoneTimes, totalTime);


  let payloadDeliveryTimeSafety = (Math.exp(deliveryTime / totalTime)  - 1) / (Math.exp(1) - 1)
  payloadDeliveryTimeSafety = Math.max(0, 1 - payloadDeliveryTimeSafety);

  const droneBatterySafety = SAFETYFUNC(trip.map(d => d.stats.droneBatteryLoad), zoneTimes, totalTime); 
  const dronePowerSafety = SAFETYFUNC(trip.map(d => d.stats.dronePowerLoad), zoneTimes, totalTime);
  const droneSafety = 0.5 * (droneBatterySafety + dronePowerSafety);

  const temperatureSafety = SAFETYFUNC(trip.map(d => d.stats.droneTemperatureLoad), zoneTimes, totalTime); 
  const ascentSafety = SAFETYFUNC(trip.map(d => d.stats.difficulty), zoneTimes, totalTime);
  const windSafety = SAFETYFUNC(trip.map(d => d.stats.droneWindLoad), zoneTimes, totalTime); 
  const routeSafety = 0.3333 * (temperatureSafety + windSafety + ascentSafety);

  const assetSafety = 0.5 * (droneSafety + routeSafety);
  const patientSafety = 0.5 * (payloadSafety + payloadDeliveryTimeSafety);


  const maxTemp = Math.max(...trip.map(s => s.stats.payloadTemperature).filter(Boolean));
  const minTemp = Math.min(...trip.map(s => s.stats.payloadTemperature).filter(Boolean));
  let tempDeviation = 0;
  if (maxTemp < T_payload_min) { 
    const delta = Math.abs(maxTemp - T_payload_min);
    if (delta > tempDeviation) tempDeviation = delta;
  } else if (maxTemp > T_payload_max) {
    const delta = Math.abs(maxTemp - T_payload_max);
    if (delta > tempDeviation) tempDeviation = delta;
  }

  if (minTemp < T_payload_min) { 
    const delta = Math.abs(minTemp - T_payload_min);
    if (delta > tempDeviation) tempDeviation = delta;
  } else if (minTemp > T_payload_max) {
    const delta = Math.abs(minTemp - T_payload_max);
    if (delta > tempDeviation) tempDeviation = delta;
  }

  // invert so high nubmer means "good"
  tempDeviation *= -1;

  // console.log(minTemp, maxTemp, tempDeviation);
  // const payloadTemperatureDeviation

  // FIXME: Need to finalize the metrics and thresholds/constraints
  return { 
    id: i, 
    summary: {
      time: +(totalTime.toFixed(0)),
      energy: +(totalEnergy.toFixed(0)),
      deliveryTime: +(deliveryTime.toFixed(0)),
      deliveryTimeMargin: +(t_payload_max - deliveryTime).toFixed(0),
      payloadDeliveryTimeSafety,
      bloodIntegrity: payloadSafety,
      droneSafety,
      dronePowerSafety,
      droneBatterySafety,
      routeSafety,
      temperatureSafety,
      ascentSafety,
      windSafety,
      assetSafety,
      patientSurvival: patientSafety,
      energyReserve: +((E_full - totalEnergy) / E_full).toFixed(2),
      payloadTemperatureDeviation: tempDeviation,

      totalTurbo,
      totalAvoid,
      totalCond,
      totalComm,
      percentTurbo: totalTurbo / p.length,
      percentAvoid: totalAvoid / p.length,
      percentCond: totalCond / p.length,
      percentComm: totalComm / p.length,

      difficulty: +(totalDifficulty.toFixed(2))
    },
    trip: trip
    // plan: p 
  }
});
console.log('# of total plans', plans.length);


// Sample on a 2D grid according to metrics
let sampledPlans = plans.filter(p => {
  // return p.summary.energyReserve >= -0.2;
  return true;
});


if (process.argv.length === 3) {
  sampledPlans = [];

  let [size, xattr, zattr] = process.argv[2].split(':');
  if (!size || !xattr || !zattr) {
    console.log('Usage: node ./traverse.js [size:xattr:zattr]'); 
    process.exit(-1);
  }
  size = Math.min(1000, +size);

  const minEnergy = Math.min(...plans.map(p => p.summary[xattr]));
  const maxEnergy = Math.max(...plans.map(p => p.summary[xattr]));
  const minTime = Math.min(...plans.map(p => p.summary[zattr]));
  const maxTime = Math.max(...plans.map(p => p.summary[zattr]));
  const dupes = new Set();

  console.log('');
  console.log(`Grid sampling ${size}x${size} with xattr=${xattr} zattr=${zattr}`);
  plans.forEach(plan => {
    const x = Math.floor(size * ((plan.summary[zattr] - minTime) / (maxTime - minTime)));
    const z = Math.floor(size * ((plan.summary[xattr] - minEnergy) / (maxEnergy - minEnergy)));
    const key = `${x}:${z}`;
    if (!dupes.has(key)) {
      sampledPlans.push(plan);
      dupes.add(key);
    }
  });
  console.log('# pruned plans (after grid-based sampling)', sampledPlans.length);
} 

console.log('# of total sampled plans', sampledPlans.length);



function findExtent(arr, str) {
  let min = Infinity;
  let max = -Infinity;

  for (const item of arr) {
    const value = item.summary[str];
    if (value == null) continue; // skip undefined/null
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (min === Infinity || max === -Infinity) {
    return [0, 0];
  }
  return [ min, max ];
}



////////////////////////////////////////////////////////////////////////////////
// Write output
////////////////////////////////////////////////////////////////////////////////
function* stringifyArray(arr) {
  yield "[";
  for (let i = 0; i < arr.length; i++) {
    if (i) yield ",";
    yield JSON.stringify(arr[i]);
  }
  yield "]";
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


fs.writeFileSync('./legs.json', JSON.stringify(worldLegs),  'utf8');
fs.writeFileSync('./world.json', JSON.stringify(world),  'utf8');

await writeArrayToJSONL('plans.jsonl', sampledPlans); 
console.log('All done');

const [minEnergy, maxEnergy] = findExtent(sampledPlans, 'energyReserve');
const [minTime, maxTime] = findExtent(sampledPlans, 'time');
const [minDifficulty, maxDifficulty] = findExtent(sampledPlans, 'difficulty');
const [minMargin, maxMargin] = findExtent(sampledPlans, 'deliveryTimeMargin');
const [minPatientSurvival, maxPatientSurvival] = findExtent(sampledPlans, 'patientSurvival');
const [minAssetSafety, maxAssetSafety] = findExtent(sampledPlans, 'assetSafety');

console.log('=== stats ===');
console.log(`Energy Used: [${minEnergy}, ${maxEnergy}]`);
console.log(`Difficulty:[${minDifficulty}, ${maxDifficulty}]`);
console.log(`Delivery Margin:[${minMargin}, ${maxMargin}]`);
console.log(`Time Used: [${minTime}, ${maxTime}]`);
console.log(`Patient Surivival: [${minPatientSurvival}, ${maxPatientSurvival}]`);
console.log(`Asset Safety:; [${minAssetSafety}, ${maxAssetSafety}]`);
