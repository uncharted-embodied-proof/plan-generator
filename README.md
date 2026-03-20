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
  "comm": 0,
  "avoidance": 1,
  "turbo": 1,
  "cond": 1,
  "location": "X",
  "distance": 5000,
  "weather": "good",
  "difficulty": 29,
  "temperature": 18,
  "id": 9
}
```


A plan is a listing of world-states to be executed by the operator in order. The summary section provide aggregated user-metrics calculate over each state in the listing. The stats section provides cumulative running totals as we traverse the plan from start to finish.

```
{
  id: 222,
  summary: {
    time: 2211,
    energy: 1001,
    deliveryTime: 1133,
    deliveryTimeMargin: -133,
    payloadDeliveryTimeSafety: 0.6103290571626288,
    bloodIntegrity: 0.8817887674451838,
    droneSafety: 0.6123454547037126,
    dronePowerSafety: 0.8350086092939993,
    droneBatterySafety: 0.38968230011342575,
    routeSafety: 0.9779632131559092,
    temperatureSafety: 1.0581641215928466,
    ascentSafety: 0.8997699516310177,
    windSafety: 0.9762489845496409,
    assetSafety: 0.7951543339298108,
    patientSurvivial: 0.7460589123039063,
    energyReserve: -0.28,
    totalTurbo: 3,
    totalAvoid: 3,
    totalCond: 0,
    totalComm: 1,
    percentTurbo: 0.6,
    percentAvoid: 0.6,
    percentCond: 0,
    percentComm: 0.2,
    difficulty: 0.75
  },
  stats: [
    {
      travelTime: 277.78,
      payloadTemp: 4.12,
      battery: 0.78,
      payloadTemperatureLoad: 0.06,
      droneBatteryLoad: 0.78,
      dronePowerLoad: 0.33,
      droneWindLoad: 0.04,
      droneTemperatureLoad: 0.12,
      difficulty: 0
    },
    {
      travelTime: 555.56,
      payloadTemp: 4.37,
      battery: 0.34,
      payloadTemperatureLoad: 0.18,
      droneBatteryLoad: 0.56,
      dronePowerLoad: 0.34,
      droneWindLoad: 0.04,
      droneTemperatureLoad: 0.12,
      difficulty: 0
    },
    {
      travelTime: 300,
      payloadTemp: 4.37,
      battery: 0.12,
      payloadTemperatureLoad: 0.19,
      droneBatteryLoad: 0.78,
      dronePowerLoad: 0.31,
      droneWindLoad: 0.04,
      droneTemperatureLoad: -0.4,
      difficulty: 0
    },
    {
      travelTime: 800,
      payloadTemp: null,
      battery: -0.16,
      payloadTemperatureLoad: 0.2,
      droneBatteryLoad: 0.71,
      dronePowerLoad: 0.15,
      droneWindLoad: 0.04,
      droneTemperatureLoad: -0.4,
      difficulty: 0.2
    },
    {
      travelTime: 277.78,
      payloadTemp: null,
      battery: -0.28,
      payloadTemperatureLoad: 0.26,
      droneBatteryLoad: 0.88,
      dronePowerLoad: 0.18,
      droneWindLoad: 0.04,
      droneTemperatureLoad: 0.12,
      difficulty: 0.55
    }
  ],
  plan: [ 10, 18, 92, 64, 14 ]
}
```


### Running
Assume NodeJS is available. This will generate two files
- world.json: a graph of all world state as nodes and possible connecting edges between them
- plans.json: a listing of viale plans 
- locations.json: topologicial graph based on location

```
node ./traverse.js [grid-size]
```



### Running with chat agent
Once the above files have been generated, you can chat with an agent to reason over them.

```
node ./server.js
```

Then the UI interface is available at `http://localhost:8888`
