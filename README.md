## Plan and state generator
Provides a script that generates possible world-graph, along with listing viable plans.

Provides a simple interface to chat about the generated files

### Setup
For file generation:
- Run `npm install`

For running the server we need python as well:
- Run `pip install -r requirements.txt`

You need to create an `.env` file with a valid GEMINI_API_KEY entry


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
  "temperature"; 3,
  "difficulty": 10,
  "id": 1
}
```


A plan is a listing of world-states to be executed by the operator in order. The summary section provide aggregated user-metrics calculate over each state in the listing. The stats section provides cumulative running totals as we traverse the plan from start to finish.

```
{
  "id": 0,
  "summary": {
    "time": 89,
    "energy": 3330,
    "diff": 96
  },
  "stats": [
    { payloadTemp, battery },
    { payloadTemp, battery },
    ...
  ], 
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
- locations.json: topologicial graph based on location

```
node ./traverse.js
```



### Running with chat agent
Once the above files have been generated, you can chat with an agent to reason over them.

```
node ./server.js
```

Then the UI interface is available at `http://localhost:8888`
