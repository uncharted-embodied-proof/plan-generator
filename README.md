## Plan and state generator
Provides a script that generates possible world-graph, along with listing viable plans


### States and Plans
A state is defined as possible internal/external conditions at a given step. For example:

```
{
  "comm": 1,
  "avoidance": 1,
  "boost": 1,
  "location": "X",
  "distance": 100,
  "weather": "good",
  "difficulty": 10,
  "id": 1
}
```


A plan is a listing of world-states to be executed by the operator. The summary section provide aggregated user-metrics calculate over each state in the listing.

```
{
  "id": 0,
  "summary": {
    "time": 89,
    "energy": 3330,
    "difficulty": 96
  },
  "plan": [
    1,
    17,
    9,
    17,
    1
  ]
}
```


### Running
Assume NodeJS is available. This will generate two files
- world.json: a graph of all world state as nodes and possible connecting edges between them
- plans.json: a listing of viale plans 

```
npm install

node ./traverse.js
```



