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
const NUM_STEPS = 5;

const model = {
  comm: [1, 0],
  avoidance: [1, 0],
  turbo: [1, 0],
  cond: [1, 0],
};


const zones = [
  {
    location: 'X', 
    distance: 5000,
    weather: 'good',
    difficulty: 29,
    temperature: 18
  },
  {
    location: 'A',
    distance: 10000,
    weather: 'good',
    difficulty: 112,
    temperature: 18
  },
  {
    location: 'B',
    distance: 5000,
    weather: 'bad',
    difficulty: 310,
    temperature: 10
  },
  {
    location: 'C',
    distance: 8000,
    weather: 'good',
    difficulty: 792 ,
    temperature: 5
  },
  {
    location: 'D',
    distance: 4000,
    weather: 'good',
    difficulty: 1331,
    temperature: 8
  },
  {
    location: 'Y',
    distance: 3000,
    weather: 'good',
    difficulty: 1592, 
    temperature: 5
  }
];

// Give some constraints to the world so it isn't a K-graph
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
zones.forEach(z => {
  const permutations = cartesianObject(model);
  permutations.forEach(p => {
    worldStates.push({
      ...p,
      ...z,
      id: ++cnt
    });
  });
});


// Do some pruning so we don't explode the state space too much
// 1 - Remove comm variability at start (X)
// 2 - Remove avoidance variability at start (X)
worldStates = worldStates.filter(ws => {
  if (ws.avoidcance === 1 && ws.location === 'X') return false;
  if (ws.comm === 1 && ws.location === 'X') return false;

  if (ws.avoidcance === 1 && ws.location === 'Y') return false;
  if (ws.comm === 1 && ws.location === 'Y') return false;

  return true;
});


worldStates.forEach(s => {
  neighbourNodes(s.location, worldStates).forEach(s2 => {
    worldEdges.push({
      source: s.id,
      target: s2.id
    });
  });
});


const world = { nodes: worldStates, edges: worldEdges };

console.log('world nodes ', world.nodes.length);
console.log('world edges', world.edges.length);

const starts = world.nodes.filter(n => n.location === 'X').map(n => n.id);
const goals = world.nodes.filter(n => n.location === 'Y').map(n => n.id);


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
      return
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

console.log('Start ids:', starts);
console.log('Goal ids:', goals);

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
const worldStateMap = new Map(world.nodes.map(n => [n.id, n]));

let rawPlansThatReachedGoal = []
rawPlansThatReachedGoal = rawPlans.filter(plan => {
  return _.intersection(plan, goals).length === 1
    && starts.includes(_.last(plan));
});
console.log('# pruned plans (reach goal and home)', rawPlansThatReachedGoal.length);

rawPlansThatReachedGoal = rawPlansThatReachedGoal.filter(plan => {
  const index = plan.indexOf(d => {
    return goals.include(d);
  });

  for (let idx = (index+1); idx < plan.length; idx++) {
    const ws = worldStateMap.get(plan[idx]);
    if (ws && ws.cond === 1) {
      return false;
    }
  }
  return true;
});
console.log('# pruned plans (irrelevant payload condition)', rawPlansThatReachedGoal.length);



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
const v_boost = 18.0;
const v_ascent_max = 5.0;
const v_wind_max = 8.0;

const E_full = 780;
const E_empty = 0;

const p_preserve = 10;
const m_payload = 1.5;

const T_payload_mid = 4.0;
const T_payload_max = 6.0;
const T_payload_min = 2.0;


const t_payload_max = 1000;




const SAFETYFUNC = (values, times, totalTime) => {
  let weightedV = 0;
  for (let i = 0; i < values.length; i++) {
    const expV = (Math.exp(values[i]) - 1) / (Math.exp(1) - 1);
    weightedV += expV * (times[i] / totalTime)
  }
  return Math.max(0, 1 - weightedV);
}


const plans = rawPlansThatReachedGoal.map((p, i) => {
  let totalDifficulty = 0;
  let totalEnergy = 0;
  let totalTime = 0;
  let deliveryTime = 0;

  let dropped = false;
  let currentTemperature = T_payload_mid;
  let stats = [];

  let totalComm = 0;
  let totalAvoid = 0;
  let totalCond = 0;
  let totalTurbo = 0;

  // for (const pid of p) {
  for (let i = 0; i < p.length; i++) {
    const pid = p[i];

    const ws = worldStateMap.get(pid);
    const prevWs = i === 0 ? ws : worldStateMap.get(p[i-1]);

    const v_wind_zone = (ws.weather === 'good' ? 0.3 : 7.0);
    const f_boost = ws.turbo;
    const f_comms = ws.comm;
    const f_avoid = ws.avoidance;
    const f_cond = ws.cond;
    const f_payload = dropped === true ? 0 : 1;
    const T_zone = ws.temperature;

    totalTurbo += f_boost;
    totalAvoid += f_avoid;
    totalCond += f_cond;
    totalComm += f_comms;


    const travelTime = ws.distance / ((1 - ws.turbo) * v_base + ws.turbo* v_boost);

    const powerConsumption = (
      P_base +
      P_weather * (v_wind_zone / v_wind_max) * (1 - f_boost) +
      P_boost * f_boost + 
      P_payload * f_payload +
      P_comms * f_comms + 
      P_avoid * f_avoid +
      c_cond * (T_zone - currentTemperature) * f_cond
    );

    const energyConsumption = powerConsumption * travelTime / 3600;

    const batteryLevel = (E_full - energyConsumption) / E_full;

    const droneTemperatureLoad = (T_zone - 0.5 * (T_max + T_min)) / (0.5 * (T_max - T_min));

    const dronePowerLoad = powerConsumption / P_max;

    const droneBatteryLoad = batteryLevel;

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
    stats.push({
      travelTime: +travelTime.toFixed(2),
      payloadTemp: dropped ? null : +currentTemperature.toFixed(2),
      battery: +((E_full - totalEnergy) / E_full).toFixed(2),

      payloadTemperatureLoad: +payloadTemperatureLoad.toFixed(2),
      droneBatteryLoad: +droneBatteryLoad.toFixed(2),
      dronePowerLoad: +dronePowerLoad.toFixed(2),
      droneWindLoad: +droneWindLoad.toFixed(2),
      droneTemperatureLoad: +droneTemperatureLoad.toFixed(2),
      difficulty: +difficulty.toFixed(2),
    });

    //  Finall compute if we completed the delivery
    if (goals.includes(pid)) {
      dropped = true;
    }
  }

  const zoneTimes = stats.map(d => d.travelTime);
  const payloadSafety = SAFETYFUNC(stats.map(d => d.payloadTemperatureLoad), zoneTimes, totalTime);


  let payloadDeliveryTimeSafety = (Math.exp(deliveryTime / totalTime)  - 1) / (Math.exp(1) - 1)
  payloadDeliveryTimeSafety = Math.max(0, 1 - payloadDeliveryTimeSafety);

  const droneBatterySafety = SAFETYFUNC(stats.map(d => d.droneBatteryLoad), zoneTimes, totalTime); 
  const dronePowerSafety = SAFETYFUNC(stats.map(d => d.dronePowerLoad), zoneTimes, totalTime);
  const droneSafety = 0.5 * (droneBatterySafety + dronePowerSafety);

  const temperatureSafety = SAFETYFUNC(stats.map(d => d.droneTemperatureLoad), zoneTimes, totalTime); 
  const ascentSafety = SAFETYFUNC(stats.map(d => d.difficulty), zoneTimes, totalTime);
  const windSafety = SAFETYFUNC(stats.map(d => d.droneWindLoad), zoneTimes, totalTime); 
  const routeSafety = 0.3333 * (temperatureSafety + windSafety + ascentSafety);

  const assetSafety = 0.5 * (droneSafety + routeSafety);
  const patientSafety = 0.5 * (payloadSafety + payloadDeliveryTimeSafety);


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
      patientSurvivial: patientSafety,
      energyReserve: +((E_full - totalEnergy) / E_full).toFixed(2),

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
    stats,
    plan: p 
  }
});



// Sample on a 2D grid according to metrics
let sampledPlans = plans;
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


// Build a location topology 
const locationGraph = {
  nodes: [],
  edges: []
};

zones.forEach(z => {
  locationGraph.nodes.push({ id: z.location });
  const targets = getNextLocations(z.location );

  targets.forEach(t => {
    locationGraph.edges.push({
      source: z.location, target: t
    });
  });
});



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

fs.writeFileSync('./world.json', JSON.stringify(world),  'utf8');

const stream = fs.createWriteStream("./plans.json");
for (const chunk of stringifyArray(sampledPlans)) {
  stream.write(chunk);
}
stream.end();
stream.on("finish", () => {
  const minEnergy = Math.min(...sampledPlans.map(p => p.summary.energy));
  const maxEnergy = Math.max(...sampledPlans.map(p => p.summary.energy));
  const minTime = Math.min(...sampledPlans.map(p => p.summary.time));
  const maxTime = Math.max(...sampledPlans.map(p => p.summary.time));
  const minDifficulty = Math.min(...sampledPlans.map(p => p.summary.difficulty));
  const maxDifficulty = Math.max(...sampledPlans.map(p => p.summary.difficulty));

  const minMargin = Math.min(...sampledPlans.map(p => p.summary.deliveryMargin));
  const maxMargin = Math.max(...sampledPlans.map(p => p.summary.deliveryMargin));

  const minAssetSafety = Math.min(...sampledPlans.map(p => p.summary.assetSafety));
  const maxAssetSafety = Math.max(...sampledPlans.map(p => p.summary.assetSafety));

  const minPatientSafety = Math.min(...sampledPlans.map(p => p.summary.patientSurvivial));
  const maxPatientSafety = Math.max(...sampledPlans.map(p => p.summary.patientSurvivial));

  const minDroneSafety = Math.min(...sampledPlans.map(p => p.summary.droneSafety));
  const maxDroneSafety = Math.max(...sampledPlans.map(p => p.summary.droneSafety));


  console.log('');
  console.log("plans.json written");
  console.log('');
  console.log('=== stats ===');
  console.log(`Energy Used: [${minEnergy}, ${maxEnergy}]`);
  console.log(`Time Used: [${minTime}, ${maxTime}]`);
  console.log(`Difficulty:[${minDifficulty}, ${maxDifficulty}]`);
  console.log(`Delivery Margin:[${minMargin}, ${maxMargin}]`);
  console.log(`Asset Safety:[${minAssetSafety}, ${maxAssetSafety}]`);
  console.log(`Patient Safety:[${minPatientSafety}, ${maxPatientSafety}]`);
  console.log(`Drone Safety:[${minDroneSafety}, ${maxDroneSafety}]`);

  console.log(sampledPlans[222]);
  printPlan(sampledPlans[222], world.nodes);
  // const test = new Set(sampledPlans.map(p => p.summary.difficulty));
  // console.log(test);

});
fs.writeFileSync('./locations.json', JSON.stringify(locationGraph),  'utf8');

