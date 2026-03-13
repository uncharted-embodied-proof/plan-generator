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

function isEqualNoId(obj1, obj2) {
  const keys1 = Object.keys(obj1).filter(k => k !== 'id');
  const keys2 = Object.keys(obj2).filter(k => k !== 'id');

  if (keys1.length !== keys2.length) return false;

  return keys1.every(key => obj1[key] === obj2[key]);
}




////////////////////////////////////////////////////////////////////////////////
// World specification
////////////////////////////////////////////////////////////////////////////////
const NUM_STEPS = 5;


const model = {
  comm: [1, 0],
  avoidance: [1, 0],
  boost: [1, 0],
  heater: [1, 0],
};


/*
const model = {
  comm: [0],
  avoidance: [0],
  boost: [1],
  heater: [0],
};
*/


const zones = [
  {
    location: 'X', 
    distance: 5000,
    weather: 'good',
    difficulty: 29,
    temperature: 18
  },
  {
    location: 'Y',
    distance: 3000,
    weather: 'good',
    difficulty: 1592, 
    temperature: 5
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

console.log('start ids', starts);
console.log('goal ids', goals);

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
    if (ws && ws.heater === 1) {
      return false;
    }
  }
  return true;
});
console.log('# pruned plans (irrelevant payload condition)', rawPlansThatReachedGoal.length);



/* Score the plans with user criteria */
const NONE = 1.0;
const AVOIDANCE_EFFECT = 0.8;
const COMM_EFFECT = 0.8;

const ENERGEY_PER_UNIT  = 2;
const PAYLOAD_ENERGY_PER_UNIT = 0.2;
const COMM_ENERGY_PER_UNIT = 0.1;
const AVOIDANCE_ENERGY_PER_UNIT = 0.1;

const BOOST = 1.5;
const BASE_SPEED = 3;



const v_base = 8.0;
const v_boost = 18.0;


const P_base = 1000;
const P_boost = 200;
const P_payload = 1000;
const P_comms = 8;
const P_avoid = 20;
const P_weather = 237;
const E_full = 780;


const T_payload = 4.0;
const W_base = 2000;
const c_cond = 0.2;
const c_payload = 4200;
const m_payload = 1.5;

const plans = rawPlansThatReachedGoal.map((p, i) => {
  let totalDifficulty = 0;
  let totalEnergy = 0;
  let totalTime = 0;

  let dropped = false;
  let currentTemperature = T_payload;
  let stats = [];

  for (const pid of p) {
    const ws = worldStateMap.get(pid);
    const travelTime = ws.distance / ((1 - ws.boost) * v_base + ws.boost * v_boost);

    const weatherValue = (ws.weather === 'good' ? 0 : 2000);

    const energyUsage = travelTime * (
      P_base + P_weather * ( weatherValue / W_base) * (1 - ws.boost) + 
      P_boost * ws.boost + 
      P_payload * (dropped === false ? 1 : 0 ) + 
      P_comms * ws.comm + 
      P_avoid * ws.avoidance + 
      c_cond * (ws.temperature - T_payload) * ws.heater
    ) / 3600; 

    // const temperatureDelta = T_payload * ws.heater + (1 - ws.heater) * (ws.temperature - T_payload) * c_cond * travelTime / (c_payload * m_payload)
    // currentTemperature += temperatureDelta;

    // const temperatureDelta = T_payload * ws.heater + (1 - ws.heater) * (ws.temperature - currentTemperature) * c_cond * travelTime / (c_payload * m_payload)
    // currentTemperature += temperatureDelta;


    const temperatureDelta = (ws.temperature - currentTemperature) * c_cond * travelTime / (c_payload * m_payload);
    currentTemperature = (1 - ws.heater) * (currentTemperature + temperatureDelta) + ws.heater * T_payload;


    const difficulty = ws.difficulty * (1 - ws.comm) * (1 - ws.avoidance) + weatherValue * (1 - ws.boost);

    // console.log(travelTime, energyUsage, currentTemperature);

    // Calculation all done, settle up
    totalTime += travelTime;
    totalEnergy += energyUsage;
    totalDifficulty += difficulty;

    /**
     * b - battery remaining
     * t - payload temperature
    */
    stats.push({
      payloadTemp: dropped ? null : currentTemperature,
      battery: +((E_full - totalEnergy) / E_full).toFixed(2)
    });

    //  Finall compute if we completed the delivery
    if (goals.includes(pid)) {
      dropped = true;
    }
  }

  return { 
    id: i, 
    summary: {
      time: +(totalTime.toFixed(0)),
      energy: +(totalEnergy.toFixed(0)),
      diff: +(totalDifficulty.toFixed(0)),
    },
    stats,
    plan: p 
  }
});



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


function* stringifyArray(arr) {
  yield "[";
  for (let i = 0; i < arr.length; i++) {
    if (i) yield ",";
    yield JSON.stringify(arr[i]);
  }
  yield "]";
}


fs.writeFileSync('./world.json', JSON.stringify(world),  'utf8');
// fs.writeFileSync('./plans.json', JSON.stringify(plans),  'utf8');

const stream = fs.createWriteStream("./plans.json");
for (const chunk of stringifyArray(plans)) {
  stream.write(chunk);
}
stream.end();
stream.on("finish", () => {
  console.log("plans.json written");
});

fs.writeFileSync('./locations.json', JSON.stringify(locationGraph),  'utf8');
// process.exit()

