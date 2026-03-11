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
  boost: [1, 0]
};

const zones = [
  {
    location: 'X', 
    distance: 100,
    weather: 'good',
    difficulty: 10
  },
  {
    location: 'Y',
    distance: 100,
    weather: 'good',
    difficulty: 10
  },
  {
    location: 'A',
    distance: 50,
    weather: 'bad',
    difficulty: 10
  },
  {
    location: 'B',
    distance: 10,
    weather: 'bad',
    difficulty: 100
  },
  {
    location: 'C',
    distance: 50,
    weather: 'good',
    difficulty: 100
  },
  {
    location: 'D',
    distance: 200,
    weather: 'good',
    difficulty: 10
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

    if (starts.includes(current) && depth > 0) {
      // console.log(path);
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
    if (depth === k) {
      results.push([...path]);
    }

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
let rawPlansThatReachedGoal = []
rawPlansThatReachedGoal = rawPlans.filter(plan => {
  return _.intersection(plan, goals).length === 1
    && starts.includes(_.last(plan));
});
console.log('# pruned plans', rawPlansThatReachedGoal.length);


/* Score the plans with user criteria */
const worldStateMap = new Map(world.nodes.map(n => [n.id, n]));
const NONE = 1.0;
const AVOIDANCE_EFFECT = 0.8;
const COMM_EFFECT = 0.8;

const ENERGEY_PER_UNIT  = 2;
const PAYLOAD_ENERGY_PER_UNIT = 0.2;
const COMM_ENERGY_PER_UNIT = 0.1;
const AVOIDANCE_ENERGY_PER_UNIT = 0.1;

const BOOST = 1.5;
const BASE_SPEED = 3;


const plans = rawPlansThatReachedGoal.map((p, i) => {
  let dropped = false;
  let totalDifficulty = 0;
  let totalEnergy = 0;
  let totalTime = 0;

  for (const pid of p) {
    const ws = worldStateMap.get(pid);

    const speed = BASE_SPEED * (ws.boost === 1 ? BOOST : NONE);

    // Energy 
    let energyExpense = Math.pow(ENERGEY_PER_UNIT, ws.boost === 1 ? 3 : 1);
    let energy = energyExpense * ws.distance; 

    if (dropped === false) {
      energy += PAYLOAD_ENERGY_PER_UNIT * ws.distance;
    }
    if (ws.comm === 1) {
      energy += COMM_ENERGY_PER_UNIT * ws.distance;
    }
    if (ws.avoidance === 1) {
      energy += AVOIDANCE_ENERGY_PER_UNIT * ws.distance;
    }
    totalEnergy += energy;
    
    // Safety
    let difficulty = ws.difficulty;
    difficulty += ws.weather === 'bad' ? 50 : 0;
    difficulty *= ws.avoidance === 1 ? AVOIDANCE_EFFECT : NONE;
    difficulty *= ws.comm === 1 ? COMM_EFFECT : NONE; 
    totalDifficulty += difficulty;

    // Time
    let time = ws.distance / speed;
    totalTime += time;


    if (goals.includes(pid)) {
      dropped = true;
    }
  }

  return { 
    id: i, 
    summary: {
      time: +(totalTime.toFixed(0)),
      energy: +(totalEnergy.toFixed(0)),
      difficulty: +(totalDifficulty.toFixed(0)),
    },
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


fs.writeFileSync('./world.json', JSON.stringify(world),  'utf8');
fs.writeFileSync('./plans.json', JSON.stringify(plans),  'utf8');
fs.writeFileSync('./locations.json', JSON.stringify(locationGraph),  'utf8');
process.exit()

